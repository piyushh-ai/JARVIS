import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import { requireAuth, withNoStore } from "@/lib/auth/guards";
import { createHome } from "@/services/authService";

export async function GET() {
  await connection();

  try {
    const auth = await requireAuth();
    return withNoStore(
      successResponse("Homes fetched successfully", {
        homes: auth.homes,
        currentHome: auth.currentHome,
      })
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    const body = await parseJsonBody(request);
    const result = await createHome({
      userId: auth.user._id,
      rawToken: auth.rawToken,
      payload: body,
    });

    return withNoStore(successResponse("Home created successfully", result, 201));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
