import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import { requireAuth, withNoStore } from "@/lib/auth/guards";
import { removeHomeMember, updateHomeMemberRole } from "@/services/authService";

export async function PATCH(request, { params }) {
  try {
    const auth = await requireAuth(request);
    const { id, memberId } = await params;
    const body = await parseJsonBody(request);
    const members = await updateHomeMemberRole({
      homeId: id,
      targetUserId: memberId,
      payload: body,
      auth,
    });
    return withNoStore(successResponse("Member role updated", members));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireAuth(request);
    const { id, memberId } = await params;
    const members = await removeHomeMember({
      homeId: id,
      targetUserId: memberId,
      auth,
    });
    return withNoStore(successResponse("Member removed from home", members));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}
