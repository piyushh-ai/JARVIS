import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import { revokeController } from "@/services/hardwareService";

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const body = await parseOptionalJsonBody(request);
    const home = resolveAuthorizedHome(
      auth,
      body.homeId || request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin"]);

    const revoked = await revokeController(id, { homeId: home._id });
    return withNoStore(
      successResponse("ESP32 controller token revoked", revoked)
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
