import crypto from "node:crypto";
import { after } from "next/server";
import { handleApiError, ServiceError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import { withNoStore } from "@/lib/auth/guards";
import { connectDB } from "@/lib/db/connect";
import Device from "@/models/Device";
import Room from "@/models/Room";
import { SMART_SCENES } from "@/lib/scenes/sceneDefinitions";
import { authenticateEsp32Request } from "@/services/hardwareService";
import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { parseAndPrepareVoiceWav } from "@/services/ai/esp32VoiceAudio";
import { getCachedVoiceCatalog, setCachedVoiceCatalog } from "@/services/ai/esp32VoiceCache";
import { loadEsp32VoiceSession, persistEsp32VoiceTurn, refreshEsp32VoiceSummary } from "@/services/ai/esp32VoiceSessionService";
import { claimPendingCommands } from "@/services/commandService";
import { normalizeVoiceText as normalizeText, findWakeWord, detectExplicitAction, hasConflictingExplicitActions, resolveClarificationFollowup, toInlineVoiceCommands, makeVoiceResponseData } from "@/services/ai/esp32VoiceLogic";

export const maxDuration = 30;
// Keep this aligned with the MongoDB Atlas cluster's region.
export const preferredRegion = "bom1";

const MAX_AUDIO_BYTES = 256 * 1024;
const GEMINI_TIMEOUT_MS = 8000;
const WAKE_WORD_ALIASES = ["jarvis", "jarvish", "jarwis", "jarvas", "javis", "jarviss", "जार्विस"];
const SCENE_ACTION = {
  good_morning: "on",
  good_night: "off",
  away_mode: "off",
  all_lights_on: "on",
  all_lights_off: "off",
};

async function readBoundedAudio(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new ServiceError("Audio payload exceeds the 256 KB limit", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("Audio request body is required", 400);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new ServiceError("Audio payload exceeds the 256 KB limit", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function loadCatalog(homeId) {
  const cached = getCachedVoiceCatalog(homeId);
  if (cached) return cached;
  await connectDB();
  const [rooms, devices] = await Promise.all([
    Room.find({ homeId }).select("_id name").lean(),
    Device.find({ homeId }).select("_id name type roomId relayNumber desiredState reportedState connectionStatus esp32DeviceId").lean(),
  ]);
  const roomMap = new Map(rooms.map((r) => [String(r._id), r.name]));
  return setCachedVoiceCatalog(homeId, {
    rooms: rooms.map((r) => ({ id: String(r._id), name: r.name })),
    devices: devices.map((d) => ({
      id: String(d._id), name: d.name, type: d.type,
      roomId: String(d.roomId), roomName: roomMap.get(String(d.roomId)) || "Unassigned",
      relayNumber: d.relayNumber ?? null, desiredState: d.desiredState,
      reportedState: d.reportedState, connectionStatus: d.connectionStatus,
      esp32DeviceId: d.esp32DeviceId || null,
    })),
    scenes: SMART_SCENES.map((s) => ({ id: s.id, name: s.name, description: s.description })),
  });
}

function buildPrompt(catalog, session) {
  return [
    "You are JARVIS, a precise Hinglish/Hindi/English smart-home voice assistant. Return only JSON matching the schema.",
    "Audio is mono WAV and may be quiet, distant, or noisy. Listen carefully to the FINAL consonant: 'on' and 'off' are different words.",
    "ON phrases: on, chalu, start, jala do, jalao, kholo. OFF phrases: off, band, stop, bujha do, bujhao.",
    "Never infer OFF from ON or ON from OFF. If the final consonant/action is uncertain, actionConfidence='low' and ask exactly a short clarification such as 'On karun ya off?'.",
    "Resolve device names only against the supplied catalog. If the target is unclear or multiple devices match, do not execute; ask one short clarification.",
    "For clear commands return kind='command', actionConfidence='high', and actions with exact deviceId or sceneId plus action.",
    "For questions return kind='question', no actions, and answer directly in reply in 1-2 short sentences in the same language/Hinglish. Use the catalog and conversation context; do not call another LLM or invent state.",
    "For no speech/background noise return kind='none', empty transcript, empty actions and reply.",
    `Wake word is ${process.env.ESP32_VOICE_WAKE_WORD?.trim() || "jarvis"}. Recognize jarvis, jarvish, jarwis, jarvas, javis, jarviss, जार्विस.`,
    "wakeWordHeard is true only if the speaker addresses JARVIS in this clip. Do not infer it from context.",
    "Return clarificationTarget with exact deviceId or sceneId when target is known but action is unclear; otherwise null.",
    "Home catalog (current desired/reported state and connectivity included):",
    JSON.stringify(catalog),
    "Earlier session summary:",
    session.summary || "(none)",
    "Conversation context (first two turns pinned, plus latest turns):",
    JSON.stringify(session.context || []),
  ].join("\n");
}

const responseSchema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    wakeWordHeard: { type: "BOOLEAN" },
    kind: { type: "STRING", enum: ["command", "question", "none"] },
    actionConfidence: { type: "STRING", enum: ["high", "low"] },
    actions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          deviceId: { type: "STRING", nullable: true },
          sceneId: { type: "STRING", nullable: true },
          action: { type: "STRING", enum: ["on", "off"] },
        },
        required: ["action"],
      },
    },
    clarification: { type: "STRING", nullable: true },
    clarificationTarget: {
      type: "OBJECT",
      properties: {
        deviceId: { type: "STRING", nullable: true },
        sceneId: { type: "STRING", nullable: true },
        targetName: { type: "STRING", nullable: true },
      },
      required: ["deviceId", "sceneId", "targetName"],
      nullable: true,
    },
    reply: { type: "STRING" },
  },
  required: ["transcript", "wakeWordHeard", "kind", "actionConfidence", "actions", "clarification", "clarificationTarget", "reply"],
};

async function callGemini({ audio, catalog, session, models, deadline }) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ServiceError("GEMINI_API_KEY is not configured", 503);
  let lastError;
  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: buildPrompt(catalog, session) },
            { inlineData: { mimeType: "audio/wav", data: audio.toString("base64") } },
          ] }],
          generationConfig: {
            temperature: 0, maxOutputTokens: 220, responseMimeType: "application/json",
            responseSchema, thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(remaining),
      });
      if (!response.ok) {
        const error = new Error(`Gemini HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      const raw = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
      if (!raw) throw new Error("Gemini returned an empty response");
      const parsed = JSON.parse(raw);
      if (!["command", "question", "none"].includes(parsed.kind) ||
          typeof parsed.transcript !== "string" || !Array.isArray(parsed.actions) ||
          !["high", "low"].includes(parsed.actionConfidence)) throw new Error("Gemini response schema mismatch");
      return { ...parsed, model };
    } catch (error) {
      lastError = error;
      if (error?.name === "TimeoutError" || error?.name === "AbortError") break;
    }
  }
  if (lastError?.name === "TimeoutError" || lastError?.name === "AbortError" || Date.now() >= deadline) {
    throw new ServiceError("Voice analysis timed out. Please retry.", 504);
  }
  throw new ServiceError("Gemini could not understand the audio request", 502);
}

async function summarizeWithGemini(previousSummary, olderText) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return previousSummary;
  const model = process.env.GEMINI_VOICE_MODEL?.trim() || "gemini-2.5-flash-lite";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Fold this older conversation into a concise factual memory. Preserve the first user question and key facts. Existing summary:\n${previousSummary}\nOlder turns:\n${olderText}` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 180, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return previousSummary;
    const payload = await response.json();
    return payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || previousSummary;
  } catch { return previousSummary; }
}

function responseData(controller, values, startedAt, timingsMs) {
  timingsMs.total = Date.now() - startedAt;
  return withNoStore(successResponse(
    "Voice request processed",
    makeVoiceResponseData(controller, values, timingsMs.total, timingsMs)
  ));
}

export { parseAndPrepareVoiceWav };

export async function POST(request) {
  const startedAt = Date.now();
  const timingsMs = { decode: 0, auth: 0, catalog: 0, gemini: 0, execute: 0 };
  try {
    const authStarted = Date.now();
    const controller = await authenticateEsp32Request(request, {
      maxRequests: 120, deviceRateLimitKeyPrefix: "esp32_voice_auth",
    });
    if (!controller.homeId || !controller.ownerId) throw new ServiceError("Controller must be linked to a Home owner", 403);
    await verifyHomeMembership({ homeId: String(controller.homeId), userId: String(controller.ownerId), allowedRoles: ["owner"] });
    await enforceRateLimit(`esp32_voice:${controller.esp32DeviceId}`, { maxRequests: 30, windowMs: 60000 });
    timingsMs.auth = Date.now() - authStarted;

    const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "audio/wav" && contentType !== "audio/x-wav") throw new ServiceError("Content-Type must be audio/wav", 415);
    const homeId = String(controller.homeId);
    const sessionPromise = loadEsp32VoiceSession({
      userId: String(controller.ownerId), homeId, controllerId: controller.esp32DeviceId,
    });
    const decodeStarted = Date.now();
    const catalogStarted = Date.now();
    const decodePromise = (async () => {
      const raw = await readBoundedAudio(request);
      const prepared = parseAndPrepareVoiceWav(raw, request.headers.get("x-audio-codec") || "");
      timingsMs.decode = Date.now() - decodeStarted;
      return prepared;
    })();
    const catalogPromise = loadCatalog(homeId).then((value) => {
      timingsMs.catalog = Date.now() - catalogStarted;
      return value;
    });
    const [audio, catalog, session] = await Promise.all([decodePromise, catalogPromise, sessionPromise]);
    // Record stable stage durations using the completed parallel stage's wall time.
    // Per-stage CPU work is small; database and audio preparation overlap by design.
    const wakeRequired = (process.env.ESP32_VOICE_REQUIRE_WAKE_WORD ?? "true").trim().toLowerCase() !== "false";
    const deadline = Date.now() + GEMINI_TIMEOUT_MS;
    const modelList = [
      process.env.GEMINI_VOICE_MODEL?.trim() || "gemini-2.5-flash-lite",
      process.env.GEMINI_VOICE_FALLBACK_MODEL?.trim() || "gemini-2.5-flash",
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    // Always transcribe once with Gemini. A recent clarification lets a short reply bypass only the wake-word gate.
    const pending = session.pendingClarification;
    const geminiStarted = Date.now();
    let parsed = await callGemini({ audio, catalog, session, models: modelList, deadline });
    timingsMs.gemini = Date.now() - geminiStarted;

    const transcript = String(parsed.transcript || "").trim().slice(0, 1500);
    const followup = resolveClarificationFollowup(transcript, pending);
    const clarificationFollowup = Boolean(followup);
    const explicitAction = detectExplicitAction(transcript);
    const explicitOnAndOff = hasConflictingExplicitActions(transcript);
    if (explicitOnAndOff) {
      parsed.actionConfidence = "low";
      parsed.clarification = "On karun ya off?";
      parsed.actions = [];
    } else if (explicitAction && parsed.actions?.length) {
      parsed.actions = parsed.actions.map((item) => ({ ...item, action: explicitAction }));
    }
    if (clarificationFollowup) {
      parsed = {
        ...parsed, kind: "command", actionConfidence: "high", clarification: null,
        actions: [{ ...(followup.deviceId ? { deviceId: followup.deviceId } : { sceneId: followup.sceneId }), action: followup.action }],
        reply: "",
      };
    }
    if (parsed.actions?.some((item) => item.sceneId && SCENE_ACTION[item.sceneId] !== item.action)) {
      parsed.actionConfidence = "low";
      parsed.clarification = "On karun ya off?";
      parsed.actions = [];
    }
    const wake = findWakeWord(transcript);
    const wakeWordHeard = parsed.wakeWordHeard === true || wake.heard;
    const commandTranscript = wake.heard ? wake.command : normalizeText(transcript)
      .replace(new RegExp(`(^|\\s)${normalizeText(process.env.ESP32_VOICE_WAKE_WORD || "jarvis")}(?=$|\\s)`, "iu"), " ").trim();
    console.log("[ESP32 voice] transcript + decision", {
      controllerId: controller.esp32DeviceId,
      model: parsed.model,
      transcript,
      commandTranscript,
      kind: parsed.kind,
      actionConfidence: parsed.actionConfidence,
      actions: parsed.actions,
      clarification: parsed.clarification || null,
      wakeWordHeard,
      timingsMs: { ...timingsMs, total: Date.now() - startedAt },
    });
    if (!transcript || parsed.kind === "none") {
      return responseData(controller, { transcript, execution: "not_executed", reason: "not_understood" }, startedAt, timingsMs);
    }
    if (wakeRequired && !wakeWordHeard && !clarificationFollowup) {
      return responseData(controller, { transcript, execution: "ignored", reason: "wake_word_missing" }, startedAt, timingsMs);
    }

    if (parsed.kind === "question") {
      const reply = String(parsed.reply || "Main abhi is sawal ka jawab nahi de pa raha.").slice(0, 500);
      after(async () => {
        try {
          await persistEsp32VoiceTurn({
            sessionId: session.conversation?._id, userId: String(controller.ownerId), homeId,
            controllerId: controller.esp32DeviceId, transcript: commandTranscript || transcript,
            reply, actions: [], pinnedCount: session.conversation?.pinnedMessages?.length || 0, now: new Date(),
          });
        } catch (error) { console.error("[ESP32 voice] conversation save failed", error?.message); }
      });
      return responseData(controller, { transcript, execution: "processed", reason: "question_answered", reply }, startedAt, timingsMs);
    }

    if (parsed.actionConfidence !== "high" || parsed.clarification || !parsed.actions?.length) {
      const question = String(parsed.clarification || (parsed.clarificationTarget?.deviceId || parsed.clarificationTarget?.sceneId ? "On karun ya off?" : "Kaunsa device control karna hai?")).slice(0, 180);
      const target = parsed.clarificationTarget || {};
      const pendingClarification = {
        ...(target.deviceId ? { deviceId: String(target.deviceId) } : {}),
        ...(target.sceneId ? { sceneId: String(target.sceneId) } : {}),
        ...(target.targetName ? { targetName: String(target.targetName).slice(0, 80) } : {}),
        createdAt: new Date(),
      };
      after(async () => {
        try {
          await persistEsp32VoiceTurn({
            sessionId: session.conversation?._id, userId: String(controller.ownerId), homeId,
            controllerId: controller.esp32DeviceId, transcript: commandTranscript || transcript,
            reply: question, clarification: question, pendingClarification, pinnedCount: session.conversation?.pinnedMessages?.length || 0,
          });
        } catch (error) { console.error("[ESP32 voice] clarification save failed", error?.message); }
      });
      return responseData(controller, { transcript, execution: "needs_clarification", reason: "ambiguous_or_low_confidence", reply: question }, startedAt, timingsMs);
    }

    const devicesById = new Map(catalog.devices.map((d) => [d.id, d]));
    const validated = parsed.actions.map((action) => {
      if (!action || !["on", "off"].includes(action.action)) throw new ServiceError("Invalid voice action", 400);
      const hasDevice = typeof action.deviceId === "string" && action.deviceId.length > 0;
      const hasScene = typeof action.sceneId === "string" && action.sceneId.length > 0;
      if (hasDevice === hasScene) throw new ServiceError("Voice action must target exactly one device or scene", 400);
      if (hasDevice) {
        const device = devicesById.get(action.deviceId);
        if (!device) throw new ServiceError("Voice action device is outside this Home", 403);
        return { ...action, device };
      }
      if (!Object.hasOwn(SCENE_ACTION, action.sceneId) || SCENE_ACTION[action.sceneId] !== action.action) {
        throw new ServiceError("Voice action scene is invalid or mismatched", 400);
      }
      return { ...action, isScene: true };
    });

    const executeStarted = Date.now();
    const executionResults = await Promise.all(validated.map(async (action) => {
      const controllerKey = crypto.createHash("sha256").update(controller.esp32DeviceId).digest("hex").slice(0, 16);
      const idempotencyKey = `voice:${controllerKey}:${crypto.randomUUID()}`;
      if (action.device) {
        const { toggleDeviceById } = await import("@/services/deviceService");
        const result = await toggleDeviceById(action.device.id, {
          desiredState: action.action, idempotencyKey,
        }, { homeId, ownerId: String(controller.ownerId) });
        return { name: action.device.name, action: action.action, deviceId: action.device.id,
          commandId: result.command?.commandId || "", status: result.command?.status || "queued" };
      }
      const { executeScene } = await import("@/services/sceneService");
      const result = await executeScene(action.sceneId, { homeId, ownerId: String(controller.ownerId), idempotencyKey });
      return { name: SMART_SCENES.find((s) => s.id === action.sceneId)?.name || action.sceneId,
        action: action.action, sceneId: action.sceneId, status: result.outcome || "queued" };
    }));
    const claimed = await claimPendingCommands({ esp32DeviceId: controller.esp32DeviceId, limit: 16 });
    timingsMs.execute = Date.now() - executeStarted;
    const commands = claimed.map((cmd) => ({
      commandId: cmd.commandId, relayNumber: cmd.relayNumber, action: cmd.action, ttlRemainingMs: cmd.ttlRemainingMs,
    }));
    const reply = String(parsed.reply || executionResults.map((r) => `${r.name} ${r.action} kar diya.`).join(" ")).slice(0, 500);
    const actionRecords = executionResults.map((r) => ({ name: r.name, action: r.action, deviceId: r.deviceId || null, sceneId: r.sceneId || null }));
    after(async () => {
      try {
        const saved = await persistEsp32VoiceTurn({
          sessionId: session.conversation?._id, userId: String(controller.ownerId), homeId,
          controllerId: controller.esp32DeviceId, transcript: commandTranscript || transcript,
          reply, actions: actionRecords, pendingClarification: null, pinnedCount: session.conversation?.pinnedMessages?.length || 0,
        });
        if (session.conversation?.messageCount >= 32) {
          await refreshEsp32VoiceSummary({
            sessionId: session.conversation._id, userId: String(controller.ownerId), homeId,
            controllerId: controller.esp32DeviceId, summarize: summarizeWithGemini,
          });
        }
        void saved;
      } catch (error) { console.error("[ESP32 voice] background persistence failed", error?.message); }
    });
    return responseData(controller, {
      transcript, execution: "processed", reason: "command_queued", reply, commands,
      details: executionResults,
    }, startedAt, timingsMs);
  } catch (error) {
    console.error("[ESP32 voice] request failed", { totalMs: Date.now() - startedAt, status: error?.statusCode || 500, message: error?.message });
    const apiError = error?.name === "VoiceAudioError" ? new ServiceError(error.message, error.statusCode || 400) : error;
    return withNoStore(handleApiError(apiError));
  }
}
