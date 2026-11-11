import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  authenticateEsp32Request,
  reportDeviceStatus,
} from "@/services/hardwareService";

export async function POST(request) {
  try {
    const controller = await authenticateEsp32Request(request);
    const body = await parseJsonBody(request);
    const statusReport = await reportDeviceStatus(controller, body);
    return successResponse("Hardware device status synced", statusReport);
  } catch (error) {
    return handleApiError(error);
  }
}

