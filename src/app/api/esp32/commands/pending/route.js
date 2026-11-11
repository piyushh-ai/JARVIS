import { connection } from "next/server";
import {
  errorResponse,
  handleApiError,
  successResponse,
} from "@/lib/utils/apiResponse";
import { claimPendingCommands } from "@/services/commandService";
import {
  authenticateEsp32Request,
  touchControllerLastSeen,
} from "@/services/hardwareService";

export async function GET(request) {
  await connection();

  try {
    const controller = await authenticateEsp32Request(request);

    const rawLimit = request.nextUrl.searchParams.get("limit");
    let limit = 8;
    if (rawLimit !== null && rawLimit !== "") {
      const n = Number(rawLimit);
      if (!Number.isInteger(n) || n < 1 || n > 16) {
        return errorResponse("limit must be an integer between 1 and 16", 400);
      }
      limit = n;
    }

    const [claimed] = await Promise.all([
      claimPendingCommands({
        esp32DeviceId: controller.esp32DeviceId,
        limit,
      }),
      touchControllerLastSeen(controller.esp32DeviceId),
    ]);

    const payload = claimed.map((cmd) => ({
      commandId: cmd.commandId,
      deviceId: cmd.deviceId,
      relayNumber: cmd.relayNumber,
      action: cmd.action,
      attemptCount: cmd.attemptCount,
      ttlRemainingMs: cmd.ttlRemainingMs,
      expiresAt: cmd.expiresAt,
    }));

    return successResponse("Pending commands claimed", payload);
  } catch (error) {
    return handleApiError(error);
  }
}

