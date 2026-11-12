import { connectDB } from "@/lib/db/connect";
import { ServiceError } from "@/lib/utils/apiResponse";
import { assertValidObjectId } from "@/lib/utils/validation";
import AutomationRule from "@/models/AutomationRule";
import Device from "@/models/Device";
import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { toggleDeviceById } from "@/services/deviceService";

export async function listAutomationRules({ homeId, userId } = {}) {
  await verifyHomeMembership({ homeId, userId });
  await connectDB();

  return AutomationRule.find({ homeId }).sort({ createdAt: -1 }).lean();
}

export async function createAutomationRule(payload = {}, { homeId, userId } = {}) {
  await verifyHomeMembership({
    homeId,
    userId,
    allowedRoles: ["owner", "admin"],
  });

  if (!payload || typeof payload !== "object") {
    throw new ServiceError("Automation rule payload is required", 400);
  }
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) {
    throw new ServiceError("Rule name is required", 400);
  }

  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  if (actions.length === 0) {
    throw new ServiceError("At least one automation action is required", 400);
  }

  const deviceIds = actions.map((item) => {
    assertValidObjectId(item?.deviceId, "action deviceId");
    if (item.action !== "on" && item.action !== "off") {
      throw new ServiceError('Action value must be "on" or "off"', 400);
    }
    return String(item.deviceId);
  });

  await connectDB();
  const ownedDevices = await Device.find({
    _id: { $in: deviceIds },
    homeId,
  })
    .select("_id")
    .lean();

  if (ownedDevices.length !== new Set(deviceIds).size) {
    throw new ServiceError(
      "All automation action devices must exist in the authorized home",
      403
    );
  }

  const created = await AutomationRule.create({
    homeId,
    ownerId: userId,
    name,
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : true,
    triggerType: payload.triggerType || "manual",
    scheduleCron: payload.scheduleCron || null,
    offsetMinutes: Number.isInteger(payload.offsetMinutes) ? payload.offsetMinutes : 0,
    timezone: typeof payload.timezone === "string" && payload.timezone.trim()
      ? payload.timezone.trim()
      : "UTC",
    actions: actions.map((item) => ({
      deviceId: item.deviceId,
      action: item.action,
    })),
  });

  return created.toObject();
}

/**
 * Executes an enabled automation rule outside in-memory timers (intended for
 * external Cron / QStash or explicit triggers). Routes every device action
 * exclusively through toggleDeviceById and records a bounded execution history.
 */
export async function executeAutomationRule({
  ruleId,
  homeId,
  userId,
  now = new Date(),
} = {}) {
  assertValidObjectId(ruleId, "automation rule ID");
  await verifyHomeMembership({
    homeId,
    userId,
    allowedRoles: ["owner", "admin", "member"],
  });

  await connectDB();
  const rule = await AutomationRule.findById(ruleId).lean();
  if (!rule) {
    throw new ServiceError("Automation rule not found", 404);
  }
  if (String(rule.homeId) !== String(homeId)) {
    throw new ServiceError(
      "Automation rule does not belong to your authorized home",
      403
    );
  }
  if (!rule.enabled) {
    throw new ServiceError("Automation rule is currently disabled", 409);
  }
  if (rule.manualOverrideUntil && new Date(rule.manualOverrideUntil) > now) {
    throw new ServiceError(
      "Automation rule is temporarily paused by manual override",
      409
    );
  }

  const queuedCommandIds = [];
  const errors = [];

  for (const step of rule.actions || []) {
    try {
      const result = await toggleDeviceById(
        String(step.deviceId),
        { desiredState: step.action },
        { homeId, ownerId: userId, now }
      );
      if (result?.command?.commandId) {
        queuedCommandIds.push(result.command.commandId);
      }
    } catch (err) {
      errors.push(err?.message || "Action dispatch failed");
    }
  }

  let status = "queued";
  if (errors.length > 0) {
    status = queuedCommandIds.length > 0 ? "partial" : "failed";
  }

  const logEntry = {
    triggeredAt: now,
    status,
    queuedCommandIds,
    errorReason: errors.length > 0 ? errors.join("; ").slice(0, 300) : null,
  };

  await AutomationRule.updateOne(
    { _id: rule._id },
    {
      $set: { lastTriggeredAt: now },
      $push: {
        recentExecutions: {
          $each: [logEntry],
          $slice: -20,
        },
      },
    }
  );

  return {
    ruleId: String(rule._id),
    name: rule.name,
    ...logEntry,
  };
}

