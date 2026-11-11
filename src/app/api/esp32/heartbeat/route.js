import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import {
  authenticateEsp32Request,
  recordHeartbeat,
} from "@/services/hardwareService";

export async function POST(request) {
  try {
    const controller = await authenticateEsp32Request(request);
    const body = await parseOptionalJsonBody(request);
    const summary = await recordHeartbeat(controller, body);
    return successResponse("Heartbeat recorded", summary);
  } catch (error) {
    return handleApiError(error);
  }
}

