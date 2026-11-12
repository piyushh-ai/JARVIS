import { connectDB } from "@/lib/db/connect";
import Command from "@/models/Command";
import Controller from "@/models/Controller";
import Device from "@/models/Device";
import { ServiceError } from "@/lib/utils/apiResponse";
import { invalidateVoiceCatalog } from "@/services/ai/esp32VoiceCache";
import {
  assertValidCommandId,
  assertValidObjectId,
  HARDWARE_REPORTED_STATES,
  validateCommandQueryFilters,
  validateCreateCommandPayload,
} from "@/lib/utils/validation";

const COMMAND_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function assertSameHome(doc, homeId, resourceLabel = "Resource") {
  if (!doc.homeId || String(doc.homeId) !== String(homeId)) {
    throw new ServiceError(
      `${resourceLabel} does not belong to your authorized home`,
      403
    );
  }
}

async function resolveMatchingIdempotency(idempotencyKey, deviceId, action, now) {
  const existing = await Command.findOne({ idempotencyKey }).lean();
  if (!existing) return null;

  if (
    String(existing.deviceId) !== String(deviceId) ||
    existing.action !== action
  ) {
    throw new ServiceError(
      "Idempotency key is already bound to a different device or action",
      409
    );
  }

  if (
    (existing.status === "pending" || existing.status === "processing") &&
    existing.expiresAt <= now
  ) {
    await expireStaleCommands({ deviceId: existing.deviceId, now });
    const refreshed = await Command.findById(existing._id).lean();
    return { command: refreshed || existing, idempotentReplay: true };
  }

  return { command: existing, idempotentReplay: true };
}

/**
 * Transitions overdue pending/processing commands past expiresAt to "expired"
 * and fails leased processing commands that exhausted maxAttempts.
 */
export async function expireStaleCommands({
  deviceId,
  esp32DeviceId,
  now = new Date(),
} = {}) {
  await connectDB();

  const scope = {};
  if (deviceId) {
    scope.deviceId = deviceId;
  }
  if (esp32DeviceId) {
    scope.esp32DeviceId = esp32DeviceId;
  }

  const [expiredRes, timeoutRes] = await Promise.all([
    Command.updateMany(
      {
        ...scope,
        status: { $in: ["pending", "processing"] },
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: "expired",
          processingUntil: null,
          errorReason: "Command expired before completion",
        },
      }
    ),
    Command.updateMany(
      {
        ...scope,
        status: "processing",
        expiresAt: { $gt: now },
        processingUntil: { $lte: now },
        $expr: { $gte: ["$attemptCount", "$maxAttempts"] },
      },
      {
        $set: {
          status: "failed",
          processingUntil: null,
          errorReason: "Command exceeded max retry attempts after lease timeout",
        },
      }
    ),
  ]);

  return {
    expiredCount: expiredRes.modifiedCount || 0,
    failedTimeoutCount: timeoutRes.modifiedCount || 0,
  };
}

/**
 * Creates a pending hardware command after validating device existence,
 * relay mapping, action, expiration rules, and optional idempotencyKey.
 */
export async function enqueueCommand(
  payload,
  { homeId, ownerId, now = new Date(), prefetchedDevice = null } = {}
) {
  assertValidObjectId(homeId, "homeId");
  const data = validateCreateCommandPayload(payload);
  await connectDB();

  const device =
    prefetchedDevice ||
    (await Device.findById(data.deviceId)
      .select("_id homeId ownerId esp32DeviceId relayNumber desiredState")
      .lean());
  if (!device) {
    throw new ServiceError("Referenced device not found", 404);
  }
  assertSameHome(device, homeId, "Device");

  const mappedEspId =
    typeof device.esp32DeviceId === "string" ? device.esp32DeviceId.trim() : "";
  const hasMappedRelay =
    Number.isInteger(device.relayNumber) &&
    device.relayNumber >= 1 &&
    device.relayNumber <= 32;

  if (!mappedEspId || !hasMappedRelay) {
    throw new ServiceError(
      "Device does not have a valid ESP32 device ID and relay number mapped",
      400
    );
  }

  if (data.relayNumber !== undefined && data.relayNumber !== device.relayNumber) {
    throw new ServiceError(
      "Requested relayNumber does not match the relay assigned to this device",
      400
    );
  }

  const [controller, existingIdem] = await Promise.all([
    Controller.findOne({ esp32DeviceId: mappedEspId })
      .select("_id homeId status")
      .lean(),
    data.idempotencyKey
      ? Command.findOne({ idempotencyKey: data.idempotencyKey }).lean()
      : Promise.resolve(null),
  ]);

  if (!controller) {
    throw new ServiceError(
      "Mapped ESP32 controller is not registered. Provision the controller first.",
      404
    );
  }
  assertSameHome(controller, homeId, "Controller");
  if (controller.status !== "active") {
    throw new ServiceError(
      `Mapped ESP32 controller is ${controller.status} and cannot accept commands`,
      409
    );
  }

  if (existingIdem) {
    if (
      String(existingIdem.deviceId) !== String(device._id) ||
      existingIdem.action !== data.action
    ) {
      throw new ServiceError(
        "Idempotency key is already bound to a different device or action",
        409
      );
    }

    if (
      (existingIdem.status === "pending" ||
        existingIdem.status === "processing") &&
      existingIdem.expiresAt <= now
    ) {
      const refreshed = await Command.findOneAndUpdate(
        {
          _id: existingIdem._id,
          status: { $in: ["pending", "processing"] },
          expiresAt: { $lte: now },
        },
        {
          $set: {
            status: "expired",
            processingUntil: null,
            errorReason: "Command expired before completion",
          },
        },
        { returnDocument: "after" }
      ).lean();

      return {
        command: refreshed || existingIdem,
        idempotentReplay: true,
        supersededByNewer: false,
      };
    }

    return {
      command: existingIdem,
      idempotentReplay: true,
      supersededByNewer: false,
    };
  }

  const expiresAt = new Date(now.getTime() + data.ttlSeconds * 1000);
  const retainUntil = new Date(now.getTime() + COMMAND_RETENTION_MS);

  try {
    const created = await Command.create({
      deviceId: device._id,
      esp32DeviceId: mappedEspId,
      homeId: device.homeId,
      ownerId: ownerId || device.ownerId,
      relayNumber: device.relayNumber,
      action: data.action,
      status: "pending",
      expiresAt,
      retainUntil,
      ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
    });

    // Supersede strictly older unstarted pending commands on this device, while
    // detecting if a strictly newer concurrent command already beat this write.
    const [, newerCommandExists] = await Promise.all([
      Command.updateMany(
        {
          deviceId: device._id,
          status: "pending",
          $or: [
            { createdAt: { $lt: created.createdAt } },
            { createdAt: created.createdAt, _id: { $lt: created._id } },
          ],
        },
        {
          $set: {
            status: "expired",
            processingUntil: null,
            errorReason: "Superseded by newer command request",
          },
        }
      ),
      Command.exists({
        deviceId: device._id,
        status: { $in: ["pending", "processing", "success"] },
        $or: [
          { createdAt: { $gt: created.createdAt } },
          { createdAt: created.createdAt, _id: { $gt: created._id } },
        ],
      }),
    ]);

    const commandObj = created.toObject();
    if (newerCommandExists) {
      await Command.updateOne(
        { _id: created._id, status: "pending" },
        {
          $set: {
            status: "expired",
            processingUntil: null,
            errorReason: "Superseded by concurrent newer command",
          },
        }
      );
      commandObj.status = "expired";
      commandObj.errorReason = "Superseded by concurrent newer command";
      return {
        command: commandObj,
        idempotentReplay: false,
        supersededByNewer: true,
      };
    }

    return {
      command: commandObj,
      idempotentReplay: false,
      supersededByNewer: false,
    };
  } catch (err) {
    if (err?.code === 11000 && data.idempotencyKey) {
      const concurrentReplay = await resolveMatchingIdempotency(
        data.idempotencyKey,
        device._id,
        data.action,
        now
      );
      if (concurrentReplay) {
        return { ...concurrentReplay, supersededByNewer: false };
      }
    }
    throw err;
  }
}

export async function listCommands(
  filters = {},
  { homeId, now = new Date() } = {}
) {
  assertValidObjectId(homeId, "homeId");
  const { query, limit } = validateCommandQueryFilters(filters);
  query.homeId = homeId;
  await connectDB();

  await expireStaleCommands({
    deviceId: query.deviceId,
    esp32DeviceId: query.esp32DeviceId,
    now,
  });

  return Command.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function getCommandById(
  identifier,
  { homeId, now = new Date() } = {}
) {
  assertValidObjectId(homeId, "homeId");
  const { field, value } = assertValidCommandId(identifier);
  await connectDB();

  await expireStaleCommands({ now });

  const command = await Command.findOne({ [field]: value }).lean();
  if (!command) {
    throw new ServiceError("Command not found", 404);
  }

  assertSameHome(command, homeId, "Command");
  return command;
}

/**
 * Atomically claims up to `limit` valid pending (or retryable lease-expired processing)
 * commands for a specific physical ESP32 controller. Intended for Step 23 controller-auth APIs.
 */
export async function claimPendingCommands({
  esp32DeviceId,
  limit = 8,
  leaseMs = 15000,
  now = new Date(),
} = {}) {
  if (typeof esp32DeviceId !== "string" || !esp32DeviceId.trim()) {
    throw new ServiceError("esp32DeviceId is required", 400);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 16) {
    throw new ServiceError("limit must be an integer between 1 and 16", 400);
  }
  if (!Number.isInteger(leaseMs) || leaseMs < 5000 || leaseMs > 60000) {
    throw new ServiceError(
      "leaseMs must be an integer between 5000 and 60000",
      400
    );
  }

  const cleanEspId = esp32DeviceId.trim();
  await connectDB();

  const claimedList = [];
  const leaseUntil = new Date(now.getTime() + leaseMs);

  for (let i = 0; i < limit; i++) {
    const claimed = await Command.findOneAndUpdate(
      {
        esp32DeviceId: cleanEspId,
        expiresAt: { $gt: now },
        $or: [
          { status: "pending" },
          {
            status: "processing",
            processingUntil: { $lte: now },
            $expr: { $lt: ["$attemptCount", "$maxAttempts"] },
          },
        ],
      },
      {
        $set: {
          status: "processing",
          processingStartedAt: now,
          processingUntil: leaseUntil,
        },
        $inc: { attemptCount: 1 },
      },
      {
        sort: { createdAt: 1, _id: 1 },
        returnDocument: "after",
      }
    )
      .select("commandId deviceId relayNumber action attemptCount expiresAt")
      .lean();

    if (!claimed) break;

    claimedList.push({
      ...claimed,
      ttlRemainingMs: Math.max(
        0,
        new Date(claimed.expiresAt).getTime() - now.getTime()
      ),
    });
  }

  return claimedList;
}

function cleanOptionalText(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ServiceError(`${fieldName} must be a string`, 400);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 300) {
    throw new ServiceError(`${fieldName} cannot exceed 300 characters`, 400);
  }
  return trimmed;
}

/**
 * Transitions a processing command to "success" or "failed", enforces device ownership,
 * blocks expired or already-finalized acknowledgements, and updates Device telemetry strictly
 * according to hardware execution outcomes. Intended for Step 23 controller-auth APIs.
 */
export async function acknowledgeCommand({
  commandId,
  esp32DeviceId,
  deviceId,
  relayNumber,
  status,
  reportedState,
  executedAt,
  result,
  errorReason,
  now = new Date(),
} = {}) {
  const { field, value } = assertValidCommandId(commandId);

  if (typeof esp32DeviceId !== "string" || !esp32DeviceId.trim()) {
    throw new ServiceError("esp32DeviceId is required", 400);
  }
  const cleanEspId = esp32DeviceId.trim();

  if (deviceId !== undefined) {
    assertValidObjectId(String(deviceId), "deviceId");
  }

  if (status !== "success" && status !== "failed") {
    throw new ServiceError(
      'Acknowledge status must be "success" or "failed"',
      400
    );
  }

  let cleanReported = undefined;
  if (reportedState !== undefined && reportedState !== null) {
    if (typeof reportedState !== "string") {
      throw new ServiceError("reportedState must be a string", 400);
    }
    const normalizedRep = reportedState.trim().toLowerCase();
    if (!HARDWARE_REPORTED_STATES.includes(normalizedRep)) {
      throw new ServiceError(
        "Invalid reportedState. Allowed values: on, off, unknown",
        400
      );
    }
    cleanReported = normalizedRep;
  }

  let parsedExecutedAt = now;
  if (executedAt !== undefined && executedAt !== null) {
    const dt = executedAt instanceof Date ? executedAt : new Date(executedAt);
    if (Number.isNaN(dt.getTime())) {
      throw new ServiceError("executedAt must be a valid timestamp", 400);
    }
    parsedExecutedAt = dt;
  }

  const cleanResult = cleanOptionalText(result, "result");
  const cleanError = cleanOptionalText(errorReason, "errorReason");

  await connectDB();

  // Optimistic single-RTT update for valid claimed commands; falls back to a slim
  // diagnostic lookup only when the transition guard rejects the ACK.
  const updatedCommand = await Command.findOneAndUpdate(
    {
      [field]: value,
      esp32DeviceId: cleanEspId,
      ...(deviceId !== undefined ? { deviceId } : {}),
      ...(relayNumber !== undefined ? { relayNumber } : {}),
      status: "processing",
      expiresAt: { $gt: now },
    },
    {
      $set: {
        status,
        executedAt: parsedExecutedAt,
        processingUntil: null,
        result: cleanResult,
        errorReason:
          status === "failed" ? cleanError || "Relay execution failed" : null,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updatedCommand) {
    const existing = await Command.findOne({ [field]: value })
      .select("_id deviceId esp32DeviceId relayNumber status expiresAt")
      .lean();

    if (!existing) {
      throw new ServiceError("Command not found", 404);
    }

    if (
      existing.esp32DeviceId !== cleanEspId ||
      (deviceId !== undefined && String(existing.deviceId) !== String(deviceId))
    ) {
      throw new ServiceError("Command belongs to another device", 403);
    }

    if (relayNumber !== undefined && existing.relayNumber !== relayNumber) {
      throw new ServiceError(
        "Acknowledged relayNumber does not match command relayNumber",
        400
      );
    }

    if (existing.status === "expired" || existing.expiresAt <= now) {
      if (existing.status === "pending" || existing.status === "processing") {
        await Command.updateOne(
          {
            _id: existing._id,
            status: { $in: ["pending", "processing"] },
            expiresAt: { $lte: now },
          },
          {
            $set: {
              status: "expired",
              processingUntil: null,
              errorReason: "Command expired before completion",
            },
          }
        );
      }
      throw new ServiceError("Cannot acknowledge an expired command", 409);
    }

    if (existing.status === "success" || existing.status === "failed") {
      throw new ServiceError(
        `Command has already been finalized with status "${existing.status}"`,
        409
      );
    }

    if (existing.status !== "processing") {
      throw new ServiceError(
        "Command must be claimed into processing before acknowledgement",
        409
      );
    }

    throw new ServiceError(
      "Command state changed concurrently before acknowledgement completed",
      409
    );
  }

  const deviceTelemetryUpdate =
    status === "success"
      ? {
          reportedState: cleanReported ?? updatedCommand.action,
          connectionStatus: "online",
          lastSeen: now,
        }
      : {
          connectionStatus: "online",
          lastSeen: now,
          ...(cleanReported ? { reportedState: cleanReported } : {}),
        };

  await Device.updateOne(
    { _id: updatedCommand.deviceId },
    { $set: deviceTelemetryUpdate }
  );

  return updatedCommand;
}

