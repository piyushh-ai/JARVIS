import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { parseOptionalJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import {
  createConversation,
  listConversations,
} from "@/services/ai/assistantService";
import { getProviderStatus } from "@/services/ai/llmProvider";

export async function GET(request) {
  await connection();
  const requestId = createRequestId(request);
  const timer = createTimer("assistant_conversations_list", requestId);

  try {
    const auth = await requireAuth();
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    timer.mark("auth");

    const conversations = await listConversations({
      homeId: home._id,
      userId: auth.user._id,
    });
    timer.mark("query");

    const timings = timer.finish({
      status: 200,
      extra: { count: conversations.length },
    });

    return applyTelemetryHeaders(
      withNoStore(
        successResponse("Conversations fetched", {
          conversations,
          provider: getProviderStatus(),
        })
      ),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}

export async function POST(request) {
  const requestId = createRequestId(request);
  const timer = createTimer("assistant_conversations_create", requestId);

  try {
    const auth = await requireAuth(request);
    timer.mark("auth");

    const [, body] = await Promise.all([
      enforceRateLimit(`ai_conv:user:${auth.user._id}`, {
        maxRequests: 30,
        windowMs: 60 * 1000,
      }),
      parseOptionalJsonBody(request),
    ]);

    const home = resolveAuthorizedHome(
      auth,
      body.homeId || request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin", "member"]);

    const conversation = await createConversation({
      homeId: home._id,
      userId: auth.user._id,
      title: body.title,
    });
    timer.mark("create");

    const timings = timer.finish({ status: 201 });

    return applyTelemetryHeaders(
      withNoStore(successResponse("Conversation created", conversation, 201)),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}

