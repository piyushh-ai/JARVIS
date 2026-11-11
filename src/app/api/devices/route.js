import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
} from "@/lib/auth/guards";
import { createDevice, listDevices } from "@/services/deviceService";

export async function GET(request) {
  await connection();

  try {
    const auth = await requireAuth();
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    const roomId = request.nextUrl.searchParams.get("roomId") || undefined;
    const type = request.nextUrl.searchParams.get("type") || undefined;
    const devices = await listDevices({ roomId, type }, { homeId: home._id });
    return successResponse("Devices fetched successfully", devices);
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

    const device = await createDevice(body, {
      homeId: home._id,
      ownerId: auth.user._id,
    });
    return successResponse("Device created successfully", device, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
