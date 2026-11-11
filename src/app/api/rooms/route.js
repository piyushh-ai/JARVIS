import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
} from "@/lib/auth/guards";
import { createRoom, listRooms } from "@/services/roomService";

export async function GET(request) {
  await connection();

  try {
    const auth = await requireAuth();
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    const rooms = await listRooms({ homeId: home._id });
    return successResponse("Rooms fetched successfully", rooms);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    const body = await parseJsonBody(request);
    const home = resolveAuthorizedHome(auth, body.homeId);
    requireHomeRole(home, ["owner", "admin"]);

    const room = await createRoom(body, {
      homeId: home._id,
      ownerId: auth.user._id,
    });
    return successResponse("Room created successfully", room, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
