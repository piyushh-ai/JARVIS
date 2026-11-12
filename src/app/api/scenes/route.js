import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { requireAuth, withNoStore } from "@/lib/auth/guards";
import { listScenes } from "@/services/sceneService";

export async function GET() {
  await connection();

  try {
    await requireAuth();
    return withNoStore(successResponse("Smart scenes fetched", listScenes()));
  } catch (error) {
    return withNoStore(handleApiError(error));
  }
}

