import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import {
  assertAdminProvisionAccess,
  revokeController,
} from "@/services/hardwareService";

export async function POST(request, { params }) {
  try {
    assertAdminProvisionAccess(request);
    const { id } = await params;
    const revoked = await revokeController(id);
    return successResponse("ESP32 controller token revoked", revoked);
  } catch (error) {
    return handleApiError(error);
  }
}

