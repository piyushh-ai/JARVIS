import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
} from "@/lib/auth/guards";
import { enqueueCommand, listCommands } from "@/services/commandService";

export async function GET(request) {
  await connection();

  try {
    const auth = await requireAuth();
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
    return successResponse("Commands fetched successfully", commands);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    const body = await parseJsonBody(request);
    const home = resolveAuthorizedHome(auth, body.homeId);
    requireHomeRole(home, ["owner", "admin", "member"]);

    const { command, idempotentReplay } = await enqueueCommand(body, {
      homeId: home._id,
      ownerId: auth.user._id,
    });

    return successResponse(
      idempotentReplay
        ? "Existing command returned (idempotent replay)"
        : "Command queued successfully (pending ESP32 execution)",
      command,
      idempotentReplay ? 200 : 201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
