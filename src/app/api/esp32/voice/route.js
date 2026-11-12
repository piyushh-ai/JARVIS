import { handleApiError, ServiceError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import { withNoStore } from "@/lib/auth/guards";
import { authenticateEsp32Request } from "@/services/hardwareService";
import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { transcribeAudioBuffer } from "@/services/ai/speechToText";


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

export async function POST(request) {
  try {
    const controller = await authenticateEsp32Request(request, {
      maxRequests: 8,
      windowMs: 60 * 1000,
    });

    if (!controller.homeId || !controller.ownerId) {
      throw new ServiceError("Controller must be linked to a Home owner", 403);
    }

    // Verify the controller's registered owner still owns its linked Home.
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
    if (audioBytes.length === 0) {
      throw new ServiceError("Audio payload is empty", 400);
    }

    const result = await transcribeAudioBuffer(audioBytes, contentType);
    return withNoStore(
      successResponse("Audio transcribed", {
        esp32DeviceId: controller.esp32DeviceId,
        ...result,
        // Transcript-only milestone: no human speaker verification or
        // assistant tool execution is enabled on this route.
        execution: "not_executed",
      })
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
