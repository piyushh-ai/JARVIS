import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
} from "@/lib/auth/guards";
import {
  deleteRoomById,
  getRoomById,
  updateRoomById,
} from "@/services/roomService";

export async function GET(request, { params }) {
  await connection();

  try {
    const auth = await requireAuth();
    const { id } = await params;
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    const room = await getRoomById(id, { homeId: home._id });
    return successResponse("Room fetched successfully", room);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const body = await parseJsonBody(request);
    const home = resolveAuthorizedHome(
      auth,
      body.homeId || request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin"]);

    const room = await updateRoomById(id, body, { homeId: home._id });
    return successResponse("Room updated successfully", room);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin"]);

    const room = await deleteRoomById(id, { homeId: home._id });
    return successResponse("Room deleted successfully", room);
  } catch (error) {
    return handleApiError(error);
  }
}
