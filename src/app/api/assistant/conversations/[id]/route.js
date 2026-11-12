import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import {
  deleteConversationById,
  getConversationById,
} from "@/services/ai/assistantService";

export async function GET(request, { params }) {
  await connection();
  const requestId = createRequestId(request);
  const timer = createTimer("assistant_conversation_get", requestId);

  try {
    const [auth, { id }] = await Promise.all([requireAuth(), params]);
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    timer.mark("auth");

    const conversation = await getConversationById(id, {
      homeId: home._id,
      userId: auth.user._id,
    });
    timer.mark("query");

    const timings = timer.finish({ status: 200 });
    return applyTelemetryHeaders(
      withNoStore(successResponse("Conversation fetched", conversation)),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}

export async function DELETE(request, { params }) {
  const requestId = createRequestId(request);
  const timer = createTimer("assistant_conversation_delete", requestId);

  try {
    const [auth, { id }] = await Promise.all([requireAuth(request), params]);
    await enforceRateLimit(`ai_conv_del:user:${auth.user._id}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin", "member"]);
    timer.mark("auth");

    const deleted = await deleteConversationById(id, {
      homeId: home._id,
      userId: auth.user._id,
    });
    timer.mark("delete");

    const timings = timer.finish({ status: 200 });
    return applyTelemetryHeaders(
      withNoStore(successResponse("Conversation deleted", deleted)),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}

