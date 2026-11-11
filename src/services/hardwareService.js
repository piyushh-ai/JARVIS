import crypto from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";
import Command from "@/models/Command";
import Controller from "@/models/Controller";
import Device from "@/models/Device";
import { ServiceError } from "@/lib/utils/apiResponse";
import { enforceRateLimit, getClientIp } from "@/lib/utils/rateLimit";
import {
  validateControllerProvisionPayload,
  validateEsp32StatusPayload,
  validateHeartbeatPayload,
} from "@/lib/utils/validation";
import { expireStaleCommands } from "@/services/commandService";

function timingSafeEqualStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function hashControllerToken(rawToken) {
  const pepper = process.env.ESP32_TOKEN_PEPPER?.trim();
  if (pepper) {
    return crypto.createHmac("sha256", pepper).update(rawToken).digest("hex");
  }
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawControllerToken() {
  const random = crypto.randomBytes(32).toString("base64url");
  const rawToken = `jrv_esp_${random}`;
  return {
    rawToken,
    tokenHash: hashControllerToken(rawToken),
    tokenPrefix: rawToken.slice(0, 14),
  };
}

function sanitizeControllerDoc(doc) {
  if (!doc) return null;
  const sanitized = { ...doc };
  delete sanitized.tokenHash;
  delete sanitized.previousTokenHash;
  return sanitized;
}

function isLoopbackHost(hostHeader = "") {
  const host = hostHeader.replace(/^\[|\]$/g, "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function assertHttpsIfProxied(request) {
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host") || "";
  if (
    process.env.NODE_ENV === "production" &&
    !isLoopbackHost(host) &&
    proto &&
    proto.toLowerCase() !== "https"
  ) {
    throw new ServiceError("HTTPS is required for hardware API requests", 403);
  }
}

/**
 * Verifies admin/owner secret for controller provisioning, rotation, and revocation
 * using JARVIS_ADMIN_SECRET (fail-closed if unconfigured).
 */
export function assertAdminProvisionAccess(request) {
  enforceRateLimit(`admin:${getClientIp(request)}`, {
    maxRequests: 30,
    windowMs: 60000,
  });

  const expectedSecret = process.env.JARVIS_ADMIN_SECRET?.trim();
  if (!expectedSecret) {
    throw new ServiceError(
      "Controller provisioning is disabled: JARVIS_ADMIN_SECRET is not configured",
      503
    );
  }

  const adminHeader = request.headers.get("x-admin-key")?.trim();
  const authHeader = request.headers.get("authorization") || "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const provided = adminHeader || bearerSecret;
  if (!provided || !timingSafeEqualStrings(provided, expectedSecret)) {
    throw new ServiceError("Unauthorized controller admin request", 401);
  }
}

/**
 * Authenticates every hardware /api/esp32/* request using X-Device-Id + Bearer token,
 * constant-time hash comparison, active status check, and per-device rate limiting.
 */
export async function authenticateEsp32Request(
  request,
  { maxRequests = 60, windowMs = 60000 } = {}
) {
  assertHttpsIfProxied(request);

  enforceRateLimit(`esp32_ip:${getClientIp(request)}`, {
    maxRequests: Math.max(maxRequests * 2, 120),
    windowMs,
  });

  const esp32DeviceId = request.headers.get("x-device-id")?.trim() || "";
  const authHeader = request.headers.get("authorization") || "";
  const rawToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (
    !esp32DeviceId ||
    esp32DeviceId.length > 100 ||
    rawToken.length < 16 ||
    rawToken.length > 256
  ) {
    throw new ServiceError(
      "Missing or malformed ESP32 authentication credentials",
      401
    );
  }

  const incomingHash = hashControllerToken(rawToken);
  await connectDB();

  const controller = await Controller.findOne({ esp32DeviceId })
    .select("+tokenHash +previousTokenHash")
    .lean();

  const now = new Date();
  const matchesPrimary =
    Boolean(controller?.tokenHash) &&
    timingSafeEqualStrings(incomingHash, controller.tokenHash);
  const matchesPrevious =
    Boolean(controller?.previousTokenHash) &&
    Boolean(controller?.previousTokenExpiresAt) &&
    new Date(controller.previousTokenExpiresAt) > now &&
    timingSafeEqualStrings(incomingHash, controller.previousTokenHash);

  if (
    !controller ||
    controller.status !== "active" ||
    (!matchesPrimary && !matchesPrevious)
  ) {
    throw new ServiceError("Invalid or revoked ESP32 credentials", 401);
  }

  enforceRateLimit(`esp32_dev:${controller.esp32DeviceId}`, {
    maxRequests,
    windowMs,
  });

  return sanitizeControllerDoc(controller);
}

export async function provisionController(payload) {
  const data = validateControllerProvisionPayload(payload);
  await connectDB();

  const { rawToken, tokenHash, tokenPrefix } = generateRawControllerToken();

  const created = await Controller.create({
    ...data,
    tokenHash,
    tokenPrefix,
    tokenVersion: 1,
    status: "active",
  });

  return {
    controller: sanitizeControllerDoc(created.toObject()),
    rawToken,
  };
}

export async function listControllers() {
  await connectDB();
  const list = await Controller.find().sort({ createdAt: -1 }).lean();
  return list.map(sanitizeControllerDoc);
}

function buildControllerLookupQuery(idOrEspId) {
  if (typeof idOrEspId !== "string" || !idOrEspId.trim()) {
    throw new ServiceError("Invalid controller identifier", 400);
  }
  const clean = idOrEspId.trim();
  const isObjectId =
    /^[a-fA-F0-9]{24}$/.test(clean) && mongoose.isValidObjectId(clean);
  return isObjectId ? { _id: clean } : { esp32DeviceId: clean };
}

export async function rotateControllerToken(
  idOrEspId,
  { graceMinutes = 15, now = new Date() } = {}
) {
  if (
    typeof graceMinutes !== "number" ||
    !Number.isInteger(graceMinutes) ||
    graceMinutes < 0 ||
    graceMinutes > 1440
  ) {
    throw new ServiceError(
      "graceMinutes must be a whole integer between 0 and 1440",
      400
    );
  }

  const lookup = buildControllerLookupQuery(idOrEspId);
  await connectDB();

  const existing = await Controller.findOne(lookup).select("+tokenHash").lean();
  if (!existing) {
    throw new ServiceError("Controller not found", 404);
  }
  if (existing.status === "revoked") {
    throw new ServiceError("Cannot rotate token for a revoked controller", 409);
  }

  const { rawToken, tokenHash, tokenPrefix } = generateRawControllerToken();
  const previousTokenExpiresAt =
    graceMinutes > 0 && existing.tokenHash
      ? new Date(now.getTime() + graceMinutes * 60 * 1000)
      : null;

  const updated = await Controller.findByIdAndUpdate(
    existing._id,
    {
      $set: {
        tokenHash,
        tokenPrefix,
        previousTokenHash:
          graceMinutes > 0 && existing.tokenHash ? existing.tokenHash : null,
        previousTokenExpiresAt,
      },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  return {
    controller: sanitizeControllerDoc(updated),
    rawToken,
    previousTokenExpiresAt,
  };
}

export async function revokeController(idOrEspId, { now = new Date() } = {}) {
  const lookup = buildControllerLookupQuery(idOrEspId);
  await connectDB();

  const updated = await Controller.findOneAndUpdate(
    lookup,
    {
      $set: {
        status: "revoked",
        tokenHash: null,
        previousTokenHash: null,
        previousTokenExpiresAt: null,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    throw new ServiceError("Controller not found", 404);
  }

  const offlineRes = await Device.updateMany(
    { esp32DeviceId: updated.esp32DeviceId },
    { $set: { connectionStatus: "offline", updatedAt: now } }
  );

  return {
    controller: sanitizeControllerDoc(updated),
    markedOfflineDevices: offlineRes.modifiedCount || 0,
  };
}

export async function touchControllerLastSeen(
  esp32DeviceId,
  { now = new Date() } = {}
) {
  await connectDB();
  await Controller.updateOne(
    { esp32DeviceId },
    { $set: { lastSeen: now } }
  );
}

/**
 * Updates controller lastSeen/telemetry and marks bound Device records online
 * without altering desiredState or reportedState.
 */
export async function recordHeartbeat(
  controller,
  payload = {},
  { now = new Date() } = {}
) {
  const telemetry = validateHeartbeatPayload(payload);
  await connectDB();

  const controllerSet = {
    lastSeen: now,
    ...(telemetry.firmwareVersion !== undefined
      ? { firmwareVersion: telemetry.firmwareVersion }
      : {}),
    ...(telemetry.rssi !== undefined ? { lastRssi: telemetry.rssi } : {}),
    ...(telemetry.uptimeSeconds !== undefined
      ? { uptimeSeconds: telemetry.uptimeSeconds }
      : {}),
    ...(telemetry.freeHeapBytes !== undefined
      ? { freeHeapBytes: telemetry.freeHeapBytes }
      : {}),
  };

  await Promise.all([
    Controller.updateOne({ _id: controller._id }, { $set: controllerSet }),
    Device.updateMany(
      { esp32DeviceId: controller.esp32DeviceId },
      { $set: { connectionStatus: "online", lastSeen: now } }
    ),
  ]);

  await expireStaleCommands({ esp32DeviceId: controller.esp32DeviceId, now });

  const pendingCommandCount = await Command.countDocuments({
    esp32DeviceId: controller.esp32DeviceId,
    status: "pending",
    expiresAt: { $gt: now },
  });

  return {
    esp32DeviceId: controller.esp32DeviceId,
    connectionStatus: "online",
    lastSeen: now,
    pendingCommandCount,
    recommendedPollMs: 3000,
    serverTime: now,
  };
}

/**
 * Reconciles physical reportedState & connectionStatus for channels owned by the
 * authenticated controller without mutating user desiredState.
 */
export async function reportDeviceStatus(
  controller,
  payload,
  { now = new Date() } = {}
) {
  const data = validateEsp32StatusPayload(payload);
  await connectDB();

  const controllerSet = {
    lastSeen: now,
    ...(data.bootReason !== undefined ? { lastBootReason: data.bootReason } : {}),
    ...(data.firmwareVersion !== undefined
      ? { firmwareVersion: data.firmwareVersion }
      : {}),
    ...(data.rssi !== undefined ? { lastRssi: data.rssi } : {}),
  };

  await Controller.updateOne({ _id: controller._id }, { $set: controllerSet });

  const boundDevices = await Device.find({
    esp32DeviceId: controller.esp32DeviceId,
  }).lean();

  const deviceByRelay = new Map();
  for (const device of boundDevices) {
    if (Number.isInteger(device.relayNumber)) {
      deviceByRelay.set(device.relayNumber, device);
    }
  }

  const bulkOps = [];
  const updatedDeviceSummaries = [];
  const unmappedRelays = [];

  for (const ch of data.channels) {
    const matched = deviceByRelay.get(ch.relayNumber);
    if (!matched) {
      unmappedRelays.push(ch.relayNumber);
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: matched._id, esp32DeviceId: controller.esp32DeviceId },
        update: {
          $set: {
            reportedState: ch.reportedState,
            connectionStatus: "online",
            lastSeen: now,
          },
        },
      },
    });

    updatedDeviceSummaries.push({
      deviceId: matched._id,
      name: matched.name,
      relayNumber: ch.relayNumber,
      desiredState: matched.desiredState,
      reportedState: ch.reportedState,
      connectionStatus: "online",
    });
  }

  if (bulkOps.length > 0) {
    await Device.bulkWrite(bulkOps);
  }

  return {
    esp32DeviceId: controller.esp32DeviceId,
    connectionStatus: "online",
    lastSeen: now,
    updatedDevices: updatedDeviceSummaries.length,
    unmappedRelays,
    devices: updatedDeviceSummaries,
  };
}
