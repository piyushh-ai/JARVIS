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
import { executeScene } from "@/services/sceneService";

export async function POST(request, { params }) {
  const requestId = createRequestId(request);
  const timer = createTimer("scene_execute", requestId);

  try {
    const [auth, { sceneId }] = await Promise.all([requireAuth(request), params]);
    timer.mark("auth");

    const [, body] = await Promise.all([
      enforceRateLimit(`scene:user:${auth.user._id}`, {
        maxRequests: 30,
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

    const execution = await executeScene(sceneId, {
      homeId: home._id,
      ownerId: auth.user._id,
      idempotencyKey: body.idempotencyKey,
    });
    timer.mark("execute");

    const isAllReplay =
      execution.idempotentReplayCount === execution.queuedCount &&
      execution.queuedCount > 0;
    const status =
      execution.outcome === "partial" ? 207 : isAllReplay ? 200 : 201;

    const message =
      execution.outcome === "partial"
        ? `Scene "${execution.scene.name}" partially queued (${execution.queuedCount} queued, ${execution.failedCount} failed)`
        : isAllReplay
          ? `Scene "${execution.scene.name}" returned existing queued commands`
          : `Scene "${execution.scene.name}" queued (${execution.queuedCount} command${execution.queuedCount === 1 ? "" : "s"} awaiting ESP32 ACK)`;

    const timings = timer.finish({
      status,
      extra: {
        sceneId: execution.scene.id,
        queuedCount: execution.queuedCount,
        failedCount: execution.failedCount,
      },
    });

    return applyTelemetryHeaders(
      withNoStore(successResponse(message, execution, status)),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}

