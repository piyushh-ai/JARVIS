import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import { withNoStore } from "@/lib/auth/guards";
import { authenticateEsp32Request } from "@/services/hardwareService";
import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { transcribeAudioBuffer } from "@/services/ai/speechToText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 384 * 1024;

export async function POST(request) {
  try {
    const controller = await authenticateEsp32Request(request, {
      maxRequests: 8,
      windowMs: 60 * 1000,
    });

    if (!controller.homeId || !controller.ownerId) {
      throw Object.assign(new Error("Controller must be linked to a Home owner"), {
        status: 403,
      });
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
      throw Object.assign(new Error("Audio payload exceeds the 384 KB limit"), {
        status: 413,
      });
    }

    const contentType = request.headers.get("content-type") || "";
    const audioBytes = Buffer.from(await request.arrayBuffer());
    if (audioBytes.length === 0) {
      throw Object.assign(new Error("Audio payload is empty"), { status: 400 });
    }
    if (audioBytes.length > MAX_AUDIO_BYTES) {
      throw Object.assign(new Error("Audio payload exceeds the 384 KB limit"), {
        status: 413,
      });
    }

    const result = await transcribeAudioBuffer(audioBytes, contentType);
    return withNoStore(
      successResponse("Audio transcribed", {
        esp32DeviceId: controller.esp32DeviceId,
        ...result,
        // Transcript-only in this milestone. Human speaker verification and
        // assistant tool execution are deliberately not enabled on this route.
        execution: "not_executed",
      })
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
