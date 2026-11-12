import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import { withNoStore } from "@/lib/auth/guards";
import {
  authenticateEsp32Request,
  recordHeartbeat,
} from "@/services/hardwareService";

export async function POST(request) {
  const requestId = createRequestId(request);
  const timer = createTimer("esp32_heartbeat", requestId);
  let controllerId = null;

  try {
    const controller = await authenticateEsp32Request(request);
    controllerId = controller.esp32DeviceId;
    timer.mark("auth");

    const body = await parseOptionalJsonBody(request);
    const summary = await recordHeartbeat(controller, body);
    timer.mark("record");

    const timings = timer.finish({
      status: 200,
      esp32DeviceId: controllerId,
      extra: { pendingCommandCount: summary.pendingCommandCount },
    });

    return applyTelemetryHeaders(
      withNoStore(successResponse("Heartbeat recorded", summary)),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({
      status: res.status,
      esp32DeviceId: controllerId,
    });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}
