import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import { updateControllerRelayConfig } from "@/services/hardwareService";

export async function PATCH(request, { params }) {
  try {
    const [auth, { id }] = await Promise.all([requireAuth(request), params]);
    const [, body] = await Promise.all([
      enforceRateLimit(`ctrl_patch:user:${auth.user._id}`, {
        maxRequests: 30,
        windowMs: 60 * 1000,
      }),
      parseJsonBody(request),
    ]);

    const home = resolveAuthorizedHome(
      auth,
      body.homeId || request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin"]);

    const updated = await updateControllerRelayConfig(id, body, {
      homeId: home._id,
    });

    return withNoStore(
      successResponse("ESP32 controller configuration updated", updated)
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}

