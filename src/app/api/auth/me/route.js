import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { requireAuth, withNoStore } from "@/lib/auth/guards";

export async function GET() {
  await connection();

  try {
    const auth = await requireAuth();
    return withNoStore(
      successResponse("Authenticated session", {
        user: auth.user,
        homes: auth.homes,
        currentHome: auth.currentHome,
      })
    );
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
