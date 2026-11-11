import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody, validateCommandAckPayload } from "@/lib/utils/validation";
import { acknowledgeCommand } from "@/services/commandService";
import {
  authenticateEsp32Request,
  touchControllerLastSeen,
} from "@/services/hardwareService";

export async function POST(request, { params }) {
  try {
    const controller = await authenticateEsp32Request(request, {
      maxRequests: 120,
    });
    const { commandId } = await params;
    const rawBody = await parseJsonBody(request);
    const ackData = validateCommandAckPayload(rawBody);

    const [updated] = await Promise.all([
      acknowledgeCommand({
        commandId,
        esp32DeviceId: controller.esp32DeviceId,
        ...ackData,
      }),
      touchControllerLastSeen(controller.esp32DeviceId),
    ]);

    return successResponse("Command acknowledged", {
      commandId: updated.commandId,
      deviceId: updated.deviceId,
      relayNumber: updated.relayNumber,
      action: updated.action,
      status: updated.status,
      executedAt: updated.executedAt,
      result: updated.result,
      errorReason: updated.errorReason,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

