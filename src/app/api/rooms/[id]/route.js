import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  deleteRoomById,
  getRoomById,
  updateRoomById,
} from "@/services/roomService";

export async function GET(_request, { params }) {
  await connection();

  try {
    const { id } = await params;
    const room = await getRoomById(id);
    return successResponse("Room fetched successfully", room);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await parseJsonBody(request);
    const room = await updateRoomById(id, body);
    return successResponse("Room updated successfully", room);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const room = await deleteRoomById(id);
    return successResponse("Room deleted successfully", room);
  } catch (error) {
    return handleApiError(error);
  }
}

