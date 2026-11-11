import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import {
  assertDevOnlyCommandApiAccess,
  getCommandById,
} from "@/services/commandService";

export async function GET(_request, { params }) {
  await connection();

  try {
    assertDevOnlyCommandApiAccess();

    const { id } = await params;
    const command = await getCommandById(id);
    return successResponse("Command fetched successfully", command);
  } catch (error) {
    return handleApiError(error);
  }
}

