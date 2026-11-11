import { handleApiError, successResponse, ServiceError } from "@/lib/utils/apiResponse";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import {
  assertAdminProvisionAccess,
  rotateControllerToken,
} from "@/services/hardwareService";

export async function POST(request, { params }) {
  try {
    assertAdminProvisionAccess(request);
    const { id } = await params;
    const body = await parseOptionalJsonBody(request);
    const graceMinutes =
      body.graceMinutes !== undefined ? body.graceMinutes : 15;

    if (typeof graceMinutes !== "number") {
      throw new ServiceError("graceMinutes must be a number", 400);
    }

    const rotated = await rotateControllerToken(id, { graceMinutes });
    return successResponse("ESP32 controller token rotated", rotated);
  } catch (error) {
    return handleApiError(error);
  }
}

