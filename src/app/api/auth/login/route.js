import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit, getClientIp } from "@/lib/utils/rateLimit";
import { parseJsonBody } from "@/lib/utils/validation";
import { assertSameOrigin, withNoStore } from "@/lib/auth/guards";
import { setSessionCookie } from "@/lib/auth/session";
import { loginUser } from "@/services/authService";

export async function POST(request) {
  try {
    assertSameOrigin(request);

    const ip = getClientIp(request);
    await enforceRateLimit(`login:ip:${ip}`, {
      maxRequests: 20,
      windowMs: 15 * 60 * 1000,
    });

    const body = await parseJsonBody(request);
    const normalizedEmail =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (normalizedEmail) {
      await enforceRateLimit(`login:email:${normalizedEmail}`, {
        maxRequests: 10,
        windowMs: 15 * 60 * 1000,
      });
    }

    const result = await loginUser(body);
    await setSessionCookie(result.rawToken, result.expiresAt);

    return withNoStore(
      successResponse("Logged in successfully", {
        user: result.user,
        homes: result.homes,
        currentHome: result.currentHome,
      })
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
