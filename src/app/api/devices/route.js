import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import { createDevice, listDevices } from "@/services/deviceService";

export async function GET(request) {
  await connection();

  try {
    const roomId = request.nextUrl.searchParams.get("roomId") || undefined;
    const type = request.nextUrl.searchParams.get("type") || undefined;
    const devices = await listDevices({ roomId, type });
    return successResponse("Devices fetched successfully", devices);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const body = await parseJsonBody(request);
    const device = await createDevice(body);
    return successResponse("Device created successfully", device, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

