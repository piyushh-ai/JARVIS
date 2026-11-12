import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import { enqueueCommand, listCommands } from "@/services/commandService";

export async function GET(request) {
  await connection();
  const requestId = createRequestId(request);
  const timer = createTimer("commands_list", requestId);

  try {
    const auth = await requireAuth();
    timer.mark("auth");

    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );

    const deviceId = request.nextUrl.searchParams.get("deviceId") || undefined;
    const esp32DeviceId =
      request.nextUrl.searchParams.get("esp32DeviceId") || undefined;
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const limit = request.nextUrl.searchParams.get("limit") || undefined;

    const commands = await listCommands(
      {
        deviceId,
        esp32DeviceId,
        status,
        limit,
      },
      { homeId: home._id }
    );
    timer.mark("query");

    const timings = timer.finish({
      status: 200,
      esp32DeviceId: esp32DeviceId || null,
      extra: { count: commands.length },
    });

    return applyTelemetryHeaders(
      withNoStore(successResponse("Commands fetched successfully", commands)),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}

export async function POST(request) {
  const requestId = createRequestId(request);
  const timer = createTimer("commands_create", requestId);

  try {
    const auth = await requireAuth(request);
    timer.mark("auth");

    const [, body] = await Promise.all([
      enforceRateLimit(`commands:user:${auth.user._id}`, {
        maxRequests: 60,
        windowMs: 60 * 1000,
      }),
      parseJsonBody(request),
    ]);
    timer.mark("limitAndBody");

    const home = resolveAuthorizedHome(auth, body.homeId);
    requireHomeRole(home, ["owner", "admin", "member"]);

    const { command, idempotentReplay } = await enqueueCommand(body, {
      homeId: home._id,
      ownerId: auth.user._id,
    });
    timer.mark("enqueue");

    const status = idempotentReplay ? 200 : 201;
    const timings = timer.finish({
      status,
      commandId: command.commandId,
      esp32DeviceId: command.esp32DeviceId,
      extra: { idempotentReplay },
    });

    return applyTelemetryHeaders(
      withNoStore(
        successResponse(
          idempotentReplay
            ? "Existing command returned (idempotent replay)"
            : "Command queued successfully (pending ESP32 execution)",
          command,
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
