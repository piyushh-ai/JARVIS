import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import { enforceRateLimit } from "@/lib/utils/rateLimit";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
} from "@/lib/utils/telemetry";
import { parseJsonBody } from "@/lib/utils/validation";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import { runAssistantTurn } from "@/services/ai/assistantService";

export async function POST(request) {
  const requestId = createRequestId(request);
  const timer = createTimer("assistant_chat", requestId);

  try {
    const auth = await requireAuth(request);
    timer.mark("auth");

    const [, body] = await Promise.all([
      enforceRateLimit(`ai_chat:user:${auth.user._id}`, {
        maxRequests: 20,
        windowMs: 60 * 1000,
      }),
      parseJsonBody(request),
    ]);
    timer.mark("limitAndBody");

    const home = resolveAuthorizedHome(
      auth,
      body.homeId || request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin", "member"]);

    const result = await runAssistantTurn({
      homeId: home._id,
      userId: auth.user._id,
      conversationId: body.conversationId || null,
      message: body.message,
      inputMode: body.inputMode,
    });
    timer.mark("assistant");

    const timings = timer.finish({
      status: 200,
      extra: {
        provider: result.provider?.name || null,
        toolCalls: result.toolExecutions.length,
      },
    });

    return applyTelemetryHeaders(
      withNoStore(successResponse("Assistant response generated", result, 200)),
      requestId,
      timings
    );
  } catch (error) {
    const res = withNoStore(handleApiError(error));
    const timings = timer.finish({ status: res.status });
    return applyTelemetryHeaders(res, requestId, timings);
  }
}

