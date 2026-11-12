import { after, connection } from "next/server";
import {
  errorResponse,
  handleApiError,
  successResponse,
} from "@/lib/utils/apiResponse";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { withNoStore } from "@/lib/auth/guards";
import {
  claimPendingCommands,
  expireStaleCommands,
} from "@/services/commandService";
import { authenticateEsp32Request } from "@/services/hardwareService";

const STALE_SWEEP_INTERVAL_MS = 15000;
const globalForSweep = globalThis;
if (!globalForSweep._jarvisLastSweepByEsp) {
  globalForSweep._jarvisLastSweepByEsp = new Map();
}
const lastSweepByEsp = globalForSweep._jarvisLastSweepByEsp;

export async function GET(request) {
  await connection();
  const requestId = createRequestId(request);
  const timer = createTimer("esp32_commands_pending", requestId);
  let controllerId = null;

  try {
    const controller = await authenticateEsp32Request(request, {
      maxRequests: 180,
    });
    controllerId = controller.esp32DeviceId;
    timer.mark("auth");

    const rawLimit = request.nextUrl.searchParams.get("limit");
    let limit = 8;
    if (rawLimit !== null && rawLimit !== "") {
      const n = Number(rawLimit);
      if (!Number.isInteger(n) || n < 1 || n > 16) {
        const res = withNoStore(
          errorResponse("limit must be an integer between 1 and 16", 400)
        );
        const timings = timer.finish({
          status: res.status,
          esp32DeviceId: controllerId,
        });
        return applyTelemetryHeaders(res, requestId, timings);
      }
      limit = n;
    }

    const claimed = await claimPendingCommands({
      esp32DeviceId: controller.esp32DeviceId,
      limit,
    });
    timer.mark("claim");

    const nowMs = Date.now();
    const lastSweepAt = lastSweepByEsp.get(controller.esp32DeviceId) || 0;
    if (nowMs - lastSweepAt >= STALE_SWEEP_INTERVAL_MS) {
      lastSweepByEsp.set(controller.esp32DeviceId, nowMs);
      after(async () => {
        try {
          await expireStaleCommands({
            esp32DeviceId: controller.esp32DeviceId,
          });
        } catch {
          // Non-blocking background maintenance must never fail polling responses
        }
      });
    }

    const payload = claimed.map((cmd) => ({
      commandId: cmd.commandId,
      deviceId: cmd.deviceId,
      relayNumber: cmd.relayNumber,
      action: cmd.action,
      attemptCount: cmd.attemptCount,
      ttlRemainingMs: cmd.ttlRemainingMs,
      expiresAt: cmd.expiresAt,
    }));

    const timings = timer.finish({
      status: 200,
      esp32DeviceId: controllerId,
      extra: { claimedCount: payload.length, limit },
    });

    return applyTelemetryHeaders(
      withNoStore(successResponse("Pending commands claimed", payload)),
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
