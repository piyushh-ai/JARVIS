import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit, getClientIp } from "@/lib/utils/rateLimit";
import { parseJsonBody } from "@/lib/utils/validation";
import { assertSameOrigin, withNoStore } from "@/lib/auth/guards";
import { setSessionCookie } from "@/lib/auth/session";
import { registerUserWithDefaultHome } from "@/services/authService";

export async function POST(request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(`register:ip:${getClientIp(request)}`, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
    });

    const body = await parseJsonBody(request);
    const result = await registerUserWithDefaultHome(body);
    await setSessionCookie(result.rawToken, result.expiresAt);

    return withNoStore(
      successResponse(
        "Account registered successfully",
        {
          user: result.user,
          homes: result.homes,
          currentHome: result.currentHome,
        },
        201
      )
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
