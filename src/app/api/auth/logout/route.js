import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { assertSameOrigin, withNoStore } from "@/lib/auth/guards";
import { clearSessionCookie, getRawSessionToken } from "@/lib/auth/session";
import { logoutByToken } from "@/services/authService";

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const rawToken = await getRawSessionToken();
    if (rawToken) {
      await logoutByToken(rawToken);
    }
    await clearSessionCookie();

    return withNoStore(successResponse("Logged out successfully", null));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
