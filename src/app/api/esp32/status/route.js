import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { parseJsonBody } from "@/lib/utils/validation";
import { withNoStore } from "@/lib/auth/guards";
import {
  authenticateEsp32Request,
  reportDeviceStatus,
} from "@/services/hardwareService";

export async function POST(request) {
  const requestId = createRequestId(request);
  const timer = createTimer("esp32_status", requestId);
  let controllerId = null;

  try {
    const controller = await authenticateEsp32Request(request);
    controllerId = controller.esp32DeviceId;
    timer.mark("auth");

    const body = await parseJsonBody(request);
    const statusReport = await reportDeviceStatus(controller, body);
    timer.mark("reconcile");

    const timings = timer.finish({
      status: 200,
      esp32DeviceId: controllerId,
      extra: { updatedDevices: statusReport.updatedDevices },
    });

    return applyTelemetryHeaders(
      withNoStore(successResponse("Hardware device status synced", statusReport)),
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
