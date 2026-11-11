import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import { createRoom, listRooms } from "@/services/roomService";

export async function GET(request) {
  await connection();

  try {
    const ownerId = request.nextUrl.searchParams.get("ownerId") || undefined;
    const rooms = await listRooms({ ownerId });
    return successResponse("Rooms fetched successfully", rooms);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const body = await parseJsonBody(request);
    const room = await createRoom(body);
    return successResponse("Room created successfully", room, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

