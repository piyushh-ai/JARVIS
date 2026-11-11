import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import { requireAuth, withNoStore } from "@/lib/auth/guards";
import { switchCurrentHome } from "@/services/authService";

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    const body = await parseJsonBody(request);
    const result = await switchCurrentHome({
      userId: auth.user._id,
      rawToken: auth.rawToken,
      payload: body,
    });

    return withNoStore(successResponse("Active home switched", result));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
