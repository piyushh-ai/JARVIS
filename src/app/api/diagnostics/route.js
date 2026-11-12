import { connection } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { handleApiError, successResponse } from "@/lib/utils/apiResponse";
import {
  applyTelemetryHeaders,
  createRequestId,
  createTimer,
  getRecordedPerformanceMetrics,
} from "@/lib/utils/telemetry";
import {
  requireAuth,
  requireHomeRole,
  resolveAuthorizedHome,
  withNoStore,
} from "@/lib/auth/guards";
import AutomationRule from "@/models/AutomationRule";
import Command from "@/models/Command";
import Controller from "@/models/Controller";
import Device from "@/models/Device";
import Room from "@/models/Room";

/**
 * GET /api/diagnostics
 * Restricted strictly to authenticated Home owners/admins.
 * Reports database ping latency, scoped collection counts, and sanitized in-process
 * API latency metrics without leaking secrets, credentials, or cross-Home data.
 */
export async function GET(request) {
  await connection();
  const requestId = createRequestId(request);
  const timer = createTimer("diagnostics", requestId);

  try {
    const auth = await requireAuth();
    const home = resolveAuthorizedHome(
      auth,
      request.nextUrl.searchParams.get("homeId")
    );
    requireHomeRole(home, ["owner", "admin"]);
    timer.mark("auth");

    await connectDB();
    const now = new Date();
    const pingStart = performance.now();
    await mongoose.connection.db.admin().ping();
    const pingMs = Math.round((performance.now() - pingStart) * 10) / 10;

    const [
      roomCount,
      deviceCount,
      controllerCount,
      pendingCommands,
      processingCommands,
      automationRuleCount,
    ] = await Promise.all([
      Room.countDocuments({ homeId: home._id }),
      Device.countDocuments({ homeId: home._id }),
      Controller.countDocuments({ homeId: home._id, status: "active" }),
      Command.countDocuments({
        homeId: home._id,
        status: "pending",
        expiresAt: { $gt: now },
      }),
      Command.countDocuments({
        homeId: home._id,
        status: "processing",
        expiresAt: { $gt: now },
      }),
      AutomationRule.countDocuments({ homeId: home._id }),
    ]);
    timer.mark("counts");

    const timings = timer.finish({ status: 200 });

    return applyTelemetryHeaders(
      withNoStore(
        successResponse("Diagnostics fetched", {
          homeId: String(home._id),
          role: home.role,
          database: {
            readyState: mongoose.connection.readyState,
            pingMs,
          },
          counts: {
            rooms: roomCount,
            devices: deviceCount,
            activeControllers: controllerCount,
            pendingCommands,
            processingCommands,
            automationRules: automationRuleCount,
          },
          performance: getRecordedPerformanceMetrics(),
          environment: process.env.NODE_ENV || "unknown",
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

