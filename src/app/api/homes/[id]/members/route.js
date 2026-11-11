import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import { requireAuth, withNoStore } from "@/lib/auth/guards";
import { addHomeMember, getHomeMembers } from "@/services/authService";

export async function GET(_request, { params }) {
  await connection();

  try {
    const auth = await requireAuth();
    const { id } = await params;
    const members = await getHomeMembers(id, auth);
    return withNoStore(successResponse("Home members fetched", members));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const body = await parseJsonBody(request);
    const members = await addHomeMember({ homeId: id, payload: body, auth });
    return withNoStore(successResponse("Home member added", members, 201));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
