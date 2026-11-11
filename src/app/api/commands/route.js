import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  assertDevOnlyCommandApiAccess,
  enqueueCommand,
  listCommands,
} from "@/services/commandService";

export async function GET(request) {
  await connection();

  try {
    assertDevOnlyCommandApiAccess();

    const deviceId = request.nextUrl.searchParams.get("deviceId") || undefined;
    const esp32DeviceId =
      request.nextUrl.searchParams.get("esp32DeviceId") || undefined;
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const limit = request.nextUrl.searchParams.get("limit") || undefined;

    const commands = await listCommands({
      deviceId,
      esp32DeviceId,
      status,
      limit,
    });
    return successResponse("Commands fetched successfully", commands);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    assertDevOnlyCommandApiAccess();

    const body = await parseJsonBody(request);
    const { command, idempotentReplay } = await enqueueCommand(body);

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

