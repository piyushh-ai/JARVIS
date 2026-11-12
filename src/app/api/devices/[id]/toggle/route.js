import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import { toggleDeviceById } from "@/services/deviceService";

export async function POST(request, { params }) {
  const requestId = createRequestId(request);
  const timer = createTimer("device_toggle", requestId);

  try {
    const [auth, { id }] = await Promise.all([requireAuth(request), params]);
    timer.mark("auth");

    const [, body] = await Promise.all([
      enforceRateLimit(`toggle:user:${auth.user._id}`, {
        maxRequests: 60,
        windowMs: 60 * 1000,
      }),
      parseOptionalJsonBody(request),
    ]);
    timer.mark("limitAndBody");

    const home = resolveAuthorizedHome(
      auth,
      body.homeId || request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin", "member"]);

    const result = await toggleDeviceById(id, body, {
      homeId: home._id,
      ownerId: auth.user._id,
    });
    timer.mark("enqueue");

    const status = result.idempotentReplay ? 200 : 201;
    const timings = timer.finish({
      status,
      commandId: result.command?.commandId || null,
      esp32DeviceId: result.command?.esp32DeviceId || null,
      extra: { idempotentReplay: result.idempotentReplay },
    });

    return applyTelemetryHeaders(
      withNoStore(
        successResponse(
          result.idempotentReplay
            ? "Existing command returned (idempotent replay)"
            : "Desired state updated and command queued (awaiting ESP32 hardware ACK)",
          result,
          status
        )
      ),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}
