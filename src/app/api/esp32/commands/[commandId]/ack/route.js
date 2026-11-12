import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { parseJsonBody, validateCommandAckPayload } from "@/lib/utils/validation";
import { withNoStore } from "@/lib/auth/guards";
import { acknowledgeCommand } from "@/services/commandService";
import { authenticateEsp32Request } from "@/services/hardwareService";

export async function POST(request, { params }) {
  const requestId = createRequestId(request);
  const timer = createTimer("esp32_commands_ack", requestId);
  let controllerId = null;
  let resolvedCommandId = null;

  try {
    const [controller, { commandId }] = await Promise.all([
      authenticateEsp32Request(request, { maxRequests: 120 }),
      params,
    ]);
    controllerId = controller.esp32DeviceId;
    resolvedCommandId = commandId;
    timer.mark("auth");

    const rawBody = await parseJsonBody(request);
    const ackData = validateCommandAckPayload(rawBody);
    timer.mark("validate");

    const updated = await acknowledgeCommand({
      commandId,
      esp32DeviceId: controller.esp32DeviceId,
      ...ackData,
    });
    timer.mark("ack");

    const timings = timer.finish({
      status: 200,
      commandId: updated.commandId,
      esp32DeviceId: controllerId,
      extra: { ackStatus: updated.status },
    });

    return applyTelemetryHeaders(
      withNoStore(
        successResponse("Command acknowledged", {
          commandId: updated.commandId,
          deviceId: updated.deviceId,
          relayNumber: updated.relayNumber,
          action: updated.action,
          status: updated.status,
          executedAt: updated.executedAt,
          result: updated.result,
          errorReason: updated.errorReason,
        })
      ),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({
      status: res.status,
      commandId: resolvedCommandId,
      esp32DeviceId: controllerId,
    });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}
