import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import {
  listControllers,
  provisionController,
} from "@/services/hardwareService";

export async function GET(request) {
  await connection();

  try {
    const auth = await requireAuth();
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    const controllers = await listControllers({ homeId: home._id });
    return withNoStore(
      successResponse("Controllers fetched successfully", controllers)
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    await enforceRateLimit(`ctrl_prov:user:${auth.user._id}`, {
      maxRequests: 20,
      windowMs: 15 * 60 * 1000,
    });

    const body = await parseJsonBody(request);
    const home = resolveAuthorizedHome(auth, body.homeId);
    requireHomeRole(home, ["owner", "admin"]);

    const provisioned = await provisionController(body, {
      homeId: home._id,
      ownerId: auth.user._id,
    });
    return withNoStore(
      successResponse("ESP32 controller provisioned", provisioned, 201)
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
