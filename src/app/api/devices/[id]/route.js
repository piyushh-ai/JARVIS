import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
} from "@/lib/auth/guards";
import {
  deleteDeviceById,
  getDeviceById,
  updateDeviceById,
} from "@/services/deviceService";

export async function GET(request, { params }) {
  await connection();

  try {
    const auth = await requireAuth();
    const { id } = await params;
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    const device = await getDeviceById(id, { homeId: home._id });
    return successResponse("Device fetched successfully", device);
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
    requireHomeRole(home, ["owner", "admin", "member"]);

    const device = await updateDeviceById(id, body, {
      homeId: home._id,
      userRole: home.role,
    });
    return successResponse("Device updated successfully", device);
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

    const device = await deleteDeviceById(id, { homeId: home._id });
    return successResponse("Device deleted successfully", device);
  } catch (error) {
    return handleApiError(error);
  }
}
