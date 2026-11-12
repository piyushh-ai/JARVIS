import crypto from "node:crypto";
import { handleApiError, ServiceError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import { withNoStore } from "@/lib/auth/guards";
import { authenticateEsp32Request } from "@/services/hardwareService";
import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { transcribeAudioBuffer } from "@/services/ai/speechToText";
import { runAssistantTurn } from "@/services/ai/assistantService";

const MAX_AUDIO_BYTES = 384 * 1024;

async function readBoundedAudio(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("Audio request body is required", 400);
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new ServiceError("Audio payload exceeds the 384 KB limit", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

function safeEqualPin(candidate, expected) {
  if (!/^\d{6,8}$/.test(candidate) || !/^\d{6,8}$/.test(expected)) return false;
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function redactSpokenPin(transcript) {
  return String(transcript || "").replace(
    /((?:pin|पिन)[^\d]{0,16})\d{6,8}/gi,
    "$1[REDACTED]"
  );
}

function extractVoiceCommand(transcript, expectedPin) {
  const normalized = String(transcript || "").trim();
  if (!/(?:\bjarvis\b|जार्विस)/i.test(normalized)) {
    return { authorized: false, reason: "wake_phrase_missing" };
  }
  const pinMatch = normalized.match(/(?:pin|पिन)[^\d]{0,16}(\d{6,8})/i);
  if (!pinMatch || !safeEqualPin(pinMatch[1], expectedPin)) {
    return { authorized: false, reason: "voice_pin_required_or_invalid" };
  }
  const command = normalized
    .replace(pinMatch[0], " ")
    .replace(/\bjarvis\b|जार्विस/gi, " ")
    .replace(/[,:;.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return command
    ? { authorized: true, command }
    : { authorized: false, reason: "command_missing" };
}

export async function POST(request) {
  try {
    // Keep the shared hardware-authentication bucket at its normal limit.
    // The 8/minute voice-specific limiter below must not throttle command polling,
    // heartbeat, status, or ACK requests that share the same auth bucket.
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
      maxRequests: 8,
      windowMs: 60 * 1000,
    });

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_AUDIO_BYTES) {
      throw new ServiceError("Audio payload exceeds the 384 KB limit", 413);
    }
    const contentType = request.headers.get("content-type") || "";
    const audioBytes = await readBoundedAudio(request);
    if (audioBytes.length === 0) throw new ServiceError("Audio payload is empty", 400);

    const transcription = await transcribeAudioBuffer(audioBytes, contentType);
    const transcript = transcription.transcript || "";
    const safeTranscription = {
      ...transcription,
      transcript: redactSpokenPin(transcript),
    };
    if (!transcript) {
      return withNoStore(successResponse("No intelligible speech detected", {
        esp32DeviceId: controller.esp32DeviceId,
        ...safeTranscription,
        execution: "not_executed",
        reason: "empty_transcript",
      }));
    }

    const expectedPin = process.env.ESP32_VOICE_PIN?.trim() || "";
    if (!/^\d{6,8}$/.test(expectedPin)) {
      return withNoStore(successResponse("Voice control is not configured", {
        esp32DeviceId: controller.esp32DeviceId,
        ...safeTranscription,
        execution: "not_executed",
        reason: "ESP32_VOICE_PIN_not_configured",
      }));
    }

    const parsed = extractVoiceCommand(transcript, expectedPin);
    if (!parsed.authorized) {
      if (parsed.reason === "voice_pin_required_or_invalid") {
        await enforceRateLimit(`esp32_voice_pin_fail:${controller.esp32DeviceId}`, {
          maxRequests: 5,
          windowMs: 5 * 60 * 1000,
        });
      }
      return withNoStore(successResponse("Transcript received; no command executed", {
        esp32DeviceId: controller.esp32DeviceId,
        ...safeTranscription,
        execution: "not_executed",
        reason: parsed.reason,
      }));
    }

    // Controller credentials authenticate hardware, not a human. The spoken
    // PIN is the explicit second factor; this prototype attributes commands
    // to the controller's registered Home owner only.
    const assistant = await runAssistantTurn({
      homeId: String(controller.homeId),
      userId: String(controller.ownerId),
      message: parsed.command,
      inputMode: "voice",
    });

    return withNoStore(successResponse("Voice command processed", {
      esp32DeviceId: controller.esp32DeviceId,
      transcript,
      command: parsed.command,
      model: transcription.model,
      execution: "processed",
      reply: assistant.reply,
      toolExecutions: assistant.toolExecutions,
      updatedDevices: assistant.updatedDevices,
      provider: assistant.provider,
    }));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
