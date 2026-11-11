import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import { toggleDeviceById } from "@/services/deviceService";

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const body = await parseOptionalJsonBody(request);
    const home = resolveAuthorizedHome(
      auth,
      body.homeId || request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin", "member"]);

    const result = await toggleDeviceById(id, body, {
      homeId: home._id,
      ownerId: auth.user._id,
    });

    return withNoStore(
      successResponse(
        result.idempotentReplay
          ? "Existing command returned (idempotent replay)"
          : "Desired state updated and command queued (awaiting ESP32 hardware ACK)",
        result,
        result.idempotentReplay ? 200 : 201
      )
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}

