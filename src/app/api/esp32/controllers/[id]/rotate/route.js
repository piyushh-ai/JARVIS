import {
  handleApiError,
  successResponse,
  ServiceError,
} from "@/lib/utils/apiResponse";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import { rotateControllerToken } from "@/services/hardwareService";

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

    const graceMinutes =
      body.graceMinutes !== undefined ? body.graceMinutes : 15;

    if (typeof graceMinutes !== "number") {
      throw new ServiceError("graceMinutes must be a number", 400);
    }

    const rotated = await rotateControllerToken(id, {
      homeId: home._id,
      graceMinutes,
    });
    return withNoStore(
      successResponse("ESP32 controller token rotated", rotated)
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
