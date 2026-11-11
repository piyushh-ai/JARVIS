import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  assertAdminProvisionAccess,
  listControllers,
  provisionController,
} from "@/services/hardwareService";

export async function GET(request) {
  await connection();

  try {
    assertAdminProvisionAccess(request);
    const controllers = await listControllers();
    return successResponse("Controllers fetched successfully", controllers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    assertAdminProvisionAccess(request);
    const body = await parseJsonBody(request);
    const provisioned = await provisionController(body);
    return successResponse("ESP32 controller provisioned", provisioned, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

