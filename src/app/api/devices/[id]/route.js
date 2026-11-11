import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  deleteDeviceById,
  getDeviceById,
  updateDeviceById,
} from "@/services/deviceService";

export async function GET(_request, { params }) {
  await connection();

  try {
    const { id } = await params;
    const device = await getDeviceById(id);
    return successResponse("Device fetched successfully", device);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await parseJsonBody(request);
    const device = await updateDeviceById(id, body);
    return successResponse("Device updated successfully", device);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const device = await deleteDeviceById(id);
    return successResponse("Device deleted successfully", device);
  } catch (error) {
    return handleApiError(error);
  }
}

