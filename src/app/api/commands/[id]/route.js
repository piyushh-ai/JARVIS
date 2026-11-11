import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { requireAuth, resolveAuthorizedHome } from "@/lib/auth/guards";
import { getCommandById } from "@/services/commandService";

export async function GET(request, { params }) {
  await connection();

  try {
    const auth = await requireAuth();
    const { id } = await params;
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    const command = await getCommandById(id, { homeId: home._id });
    return successResponse("Command fetched successfully", command);
  } catch (error) {
    return handleApiError(error);
  }
}
