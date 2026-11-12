import crypto from "node:crypto";
import { handleApiError, ServiceError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import { withNoStore } from "@/lib/auth/guards";
import { connectDB } from "@/lib/db/connect";
import Device from "@/models/Device";
import Room from "@/models/Room";
import { SMART_SCENES } from "@/lib/scenes/sceneDefinitions";
import { authenticateEsp32Request } from "@/services/hardwareService";
import { verifyHomeMembership } from "@/services/ai/homeContextService";

export const runtime = "nodejs";
export const maxDuration = 30;
// Set this to the Atlas cluster's region. bom1 is appropriate for Mumbai Atlas clusters.
export const preferredRegion = "bom1";

const MAX_AUDIO_BYTES = 256 * 1024;
const GEMINI_TIMEOUT_MS = 8000;
const WAKE_WORD_ALIASES = [
  "jarvis", "jarvish", "jarwis", "jarvas", "javis", "jarviss", "जार्विस",
];

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("en-IN")
    .normalize("NFKC")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findWakeWord(text) {
  const normalized = normalizeText(text);
  for (const alias of WAKE_WORD_ALIASES) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = normalized.match(new RegExp(`(^|\\s)${escaped}(?=$|\\s)`, "iu"));
    if (match) return { heard: true, command: normalized.replace(match[0], " ").trim() };
  }
  return { heard: false, command: normalized };
}

async function readBoundedAudio(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_AUDIO_BYTES) {
    throw new ServiceError("Audio payload exceeds the 256 KB limit", 413);
  }
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

function validatePcm16MonoWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new ServiceError("Invalid WAV audio payload", 400);
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.toString("ascii", 8, 12) !== "WAVE" ||
      buffer.readUInt32LE(4) !== buffer.length - 8) {
    throw new ServiceError("Invalid RIFF/WAVE header or file size", 400);
  }

  let offset = 12;
  let format = null;
  let dataSize = null;
  let dataEnd = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkSize;
    if (end > buffer.length) throw new ServiceError("WAV chunk size exceeds payload", 400);
    if (chunkId === "fmt ") {
      if (chunkSize < 16) throw new ServiceError("Invalid WAV format chunk", 400);
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      dataEnd = end;
    }
    offset = end + (chunkSize % 2);
  }

  if (!format || format.encoding !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
    throw new ServiceError("WAV must contain PCM16 mono audio", 415);
  }
  if (dataSize === null || dataSize <= 0 || dataEnd > buffer.length ||
      dataEnd + (dataSize % 2) !== buffer.length) {
    throw new ServiceError("WAV data chunk size does not match the payload", 400);
  }
  return true;
}

function responseData(controller, values, startedAt) {
  return withNoStore(successResponse("Voice request processed", {
    esp32DeviceId: controller.esp32DeviceId,
    transcript: values.transcript || "",
    execution: values.execution,
    reason: values.reason || "",
    reply: values.reply || "",
    serverMs: Date.now() - startedAt,
    ...(values.timingsMs ? { timingsMs: values.timingsMs } : {}),
    ...(values.details ? { details: values.details } : {}),
  }));
}

function buildPrompt(catalog) {
  return [
    "You are the JARVIS audio command parser. Return only JSON matching the supplied schema.",
    "Audio is 8 kHz mono PCM16 WAV. It may be quiet, distant, or noisy. The speaker uses Hinglish, Hindi, or English.",
    "Use only exact device, room, and scene names/IDs from the supplied home catalog to resolve speech.",
    "Ignore TV and background speech. If speech is unclear or only noise, return transcript='', kind='none', wakeWordHeard=false, actions=[]. Never invent a command from noise.",
    "Recognize wake-word pronunciations/mishearings: jarvis, jarvish, jarwis, jarvas, javis, jarviss, and जार्विस.",
    "wakeWordHeard is true only when the speaker addresses JARVIS in this clip. Do not infer it merely because a device name or command is spoken.",
    "kind='command' for clear on/off device or scene requests; kind='question' for information/status questions; kind='none' for no clear speech or unrelated/background speech.",
    "For ambiguous targets, leave actions empty and provide one short clarification question. Never guess between multiple devices.",
    "Each action must use exactly one catalog deviceId or sceneId, and action must be on/off. Scene actions use sceneId and its intended action.",
    "Home catalog:",
    JSON.stringify(catalog),
  ].join("\n");
}

const responseSchema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    wakeWordHeard: { type: "BOOLEAN" },
    kind: { type: "STRING", enum: ["command", "question", "none"] },
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
  },
  required: ["transcript", "wakeWordHeard", "kind", "actions", "clarification"],
};

async function parseVoiceWithGemini(audio, catalog) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ServiceError("GEMINI_API_KEY is not configured", 503);
  const prompt = buildPrompt(catalog);
  const models = [
    process.env.GEMINI_VOICE_MODEL?.trim() || "gemini-2.5-flash-lite",
    process.env.GEMINI_VOICE_FALLBACK_MODEL?.trim() || "gemini-2.5-flash",
  ].filter((model, index, list) => model && list.indexOf(model) === index);

  let lastError;
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType: "audio/wav", data: audio.toString("base64") } },
              ],
            }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 256,
              responseMimeType: "application/json",
              responseSchema,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        }
      );
      if (!response.ok) {
        const error = new Error(`Gemini returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      const raw = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => typeof part.text === "string" ? part.text : "")
        .join("")
        .trim();
      if (!raw) throw new Error("Gemini returned an empty structured response");
      const parsed = JSON.parse(raw);
      if (!["command", "question", "none"].includes(parsed.kind) ||
          typeof parsed.transcript !== "string" ||
          typeof parsed.wakeWordHeard !== "boolean" ||
          !Array.isArray(parsed.actions)) {
        throw new Error("Gemini response did not match the voice schema");
      }
      return { ...parsed, model };
    } catch (error) {
      lastError = error;
      if (error?.name === "TimeoutError" || error?.name === "AbortError") break;
    }
  }
  if (lastError?.name === "TimeoutError" || lastError?.name === "AbortError") {
    throw new ServiceError("Voice analysis timed out. Please retry.", 504);
  }
  throw new ServiceError("Gemini could not understand the audio request", 502);
}

function makeActionReply(action, device) {
  const name = device.name || "Device";
  return action === "on" ? `${name} on kar di.` : `${name} off kar di.`;
}

export { findWakeWord, validatePcm16MonoWav };

export async function POST(request) {
  const startedAt = Date.now();
  const timingsMs = {};
  try {
    const controller = await authenticateEsp32Request(request);
    if (!controller.homeId || !controller.ownerId) {
      throw new ServiceError("Controller must be linked to a Home owner", 403);
    }
    await verifyHomeMembership({
      homeId: String(controller.homeId),
      userId: String(controller.ownerId),
      allowedRoles: ["owner"],
    });
    await enforceRateLimit(`esp32_voice:${controller.esp32DeviceId}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });

    const parseStarted = Date.now();
    const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "audio/wav" && contentType !== "audio/x-wav") {
      throw new ServiceError("Content-Type must be audio/wav", 415);
    }
    const audio = await readBoundedAudio(request);
    validatePcm16MonoWav(audio);
    timingsMs.parseAudio = Date.now() - parseStarted;
    console.log("[ESP32 voice] audio parsed", { ms: timingsMs.parseAudio, bytes: audio.length });

    const dbStarted = Date.now();
    await connectDB();
    const homeId = String(controller.homeId);
    const [rooms, devices] = await Promise.all([
      Room.find({ homeId }).select("_id name").lean(),
      Device.find({ homeId }).select("_id name type roomId relayNumber").lean(),
    ]);
    const roomMap = new Map(rooms.map((room) => [String(room._id), room.name]));
    const catalog = {
      rooms: rooms.map((room) => ({ id: String(room._id), name: room.name })),
      devices: devices.map((device) => ({
        id: String(device._id),
        name: device.name,
        type: device.type,
        roomName: roomMap.get(String(device.roomId)) || "Unassigned",
        relayNumber: device.relayNumber ?? null,
      })),
      scenes: SMART_SCENES.map((scene) => ({ id: scene.id, name: scene.name, description: scene.description })),
    };
    timingsMs.db = Date.now() - dbStarted;
    console.log("[ESP32 voice] catalog loaded", { ms: timingsMs.db, rooms: rooms.length, devices: devices.length });

    const geminiStarted = Date.now();
    const parsed = await parseVoiceWithGemini(audio, catalog);
    timingsMs.gemini = Date.now() - geminiStarted;
    console.log("[ESP32 voice] Gemini parsed", { ms: timingsMs.gemini, model: parsed.model, kind: parsed.kind });

    const transcript = String(parsed.transcript || "").trim().slice(0, 1500);
    const transcriptWake = findWakeWord(transcript);
    const modelWake = parsed.wakeWordHeard === true;
    const wakeRequired = (process.env.ESP32_VOICE_REQUIRE_WAKE_WORD ?? "true").trim().toLowerCase() !== "false";
    const wakeWordHeard = modelWake || transcriptWake.heard;
    const wakeWord = normalizeText(process.env.ESP32_VOICE_WAKE_WORD || "jarvis");
    const commandTranscript = transcriptWake.heard
      ? transcriptWake.command
      : normalizeText(transcript).replace(new RegExp(`(^|\\s)${wakeWord.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?=$|\\s)`, "iu"), " ").trim();

    if (!transcript || parsed.kind === "none") {
      return responseData(controller, {
        transcript, execution: "ignored", reason: "not_understood", reply: "", timingsMs,
      }, startedAt);
    }
    if (wakeRequired && !wakeWordHeard) {
      return responseData(controller, {
        transcript, execution: "ignored", reason: "wake_word_missing", reply: "", timingsMs,
      }, startedAt);
    }

    if (parsed.kind === "question") {
      const { runAssistantTurn } = await import("@/services/ai/assistantService");
      const assistant = await runAssistantTurn({
        homeId,
        userId: String(controller.ownerId),
        message: commandTranscript || transcript,
        inputMode: "voice",
      });
      return responseData(controller, {
        transcript, execution: "processed", reason: "question_answered",
        reply: assistant.reply || "", timingsMs,
      }, startedAt);
    }

    if (parsed.clarification || parsed.actions.length === 0) {
      return responseData(controller, {
        transcript, execution: "needs_clarification",
        reason: "ambiguous_or_missing_target",
        reply: String(parsed.clarification || "Kaunsa device control karna hai?").slice(0, 180),
        timingsMs,
      }, startedAt);
    }

    const deviceById = new Map(devices.map((device) => [String(device._id), device]));
    const validSceneIds = new Set(SMART_SCENES.map((scene) => scene.id));
    const validated = parsed.actions.map((action) => {
      if (!action || !["on", "off"].includes(action.action)) {
        throw new ServiceError("Invalid voice action", 400);
      }
      const hasDevice = typeof action.deviceId === "string" && action.deviceId.length > 0;
      const hasScene = typeof action.sceneId === "string" && action.sceneId.length > 0;
      if (hasDevice === hasScene) throw new ServiceError("Voice action must target exactly one device or scene", 400);
      if (hasDevice) {
        const device = deviceById.get(action.deviceId);
        if (!device) throw new ServiceError("Voice action device is outside this Home", 403);
        return { ...action, device };
      }
      if (!validSceneIds.has(action.sceneId)) throw new ServiceError("Voice action scene is invalid", 400);
      return action;
    });

    const executeStarted = Date.now();
    const executionResults = await Promise.all(validated.map(async (action) => {
      const idempotencyKey = `voice:${controller.esp32DeviceId}:${crypto.randomUUID()}`;
      if (action.device) {
        const { toggleDeviceById } = await import("@/services/deviceService");
        const result = await toggleDeviceById(
          String(action.device._id),
          { desiredState: action.action, idempotencyKey },
          { homeId, ownerId: String(controller.ownerId) }
        );
        return {
          executed: true,
          name: action.device.name,
          action: action.action,
          commandId: result.command?.commandId || "",
          status: result.idempotentReplay ? "replayed" : "queued",
        };
      }
      const { executeScene } = await import("@/services/sceneService");
      const result = await executeScene(action.sceneId, {
        homeId,
        ownerId: String(controller.ownerId),
        idempotencyKey,
      });
      return {
        executed: true,
        name: SMART_SCENES.find((scene) => scene.id === action.sceneId)?.name || action.sceneId,
        action: action.action,
        status: result.outcome || "queued",
      };
    }));
    timingsMs.execute = Date.now() - executeStarted;
    console.log("[ESP32 voice] actions executed", { ms: timingsMs.execute, count: executionResults.length });

    const reply = executionResults.map((result) =>
      result.name && result.action ? makeActionReply(result.action, { name: result.name }) : `${result.name} activate kar diya.`
    ).join(" ");
    return responseData(controller, {
      transcript, execution: "processed", reason: "command_queued",
      reply, timingsMs, details: executionResults,
    }, startedAt);
  } catch (error) {
    const totalMs = Date.now() - startedAt;
    console.log("[ESP32 voice] request failed", { ms: totalMs, status: error?.statusCode || 500, message: error?.message });
    return withNoStore(handleApiError(error));
  }
}
