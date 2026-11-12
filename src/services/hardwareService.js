import crypto from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";
import Command from "@/models/Command";
import Controller from "@/models/Controller";
import Device from "@/models/Device";
import { ServiceError } from "@/lib/utils/apiResponse";
import { enforceRateLimit, getClientIp } from "@/lib/utils/rateLimit";
import {
  assertValidObjectId,
  validateControllerPatchPayload,
  validateControllerProvisionPayload,
  validateEsp32StatusPayload,
  validateHeartbeatPayload,
} from "@/lib/utils/validation";
import { expireStaleCommands } from "@/services/commandService";
import { invalidateVoiceCatalog } from "@/services/ai/esp32VoiceCache";

function assertSameControllerHome(controller, homeId) {
  if (!controller?.homeId || String(controller.homeId) !== String(homeId)) {
    throw new ServiceError(
      "Controller does not belong to your authorized home",
      403
    );
  }
}

function timingSafeEqualStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

const globalForControllerAuth = globalThis;
if (!globalForControllerAuth._jarvisEsp32AuthCache) globalForControllerAuth._jarvisEsp32AuthCache = new Map();
const controllerAuthCache = globalForControllerAuth._jarvisEsp32AuthCache;
const CONTROLLER_AUTH_CACHE_MS = 15000;

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
 * Authenticates every hardware /api/esp32/* request using X-Device-Id + Bearer token,
 * constant-time hash comparison, active status check, and concurrent rate limiting.
 */
export async function authenticateEsp32Request(
  request,
  {
    maxRequests = 120,
    windowMs = 60000,
    // Override the per-device auth bucket for isolated hardware endpoints.
    // Default preserves the existing IP+device bucket for all other routes.
    deviceRateLimitKeyPrefix = "esp32_auth",
  } = {}
) {
  assertHttpsIfProxied(request);

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
    await enforceRateLimit(`esp32_ip:${getClientIp(request)}`, {
      maxRequests: Math.max(maxRequests * 4, 240),
      windowMs,
    });
    throw new ServiceError(
      "Missing or malformed ESP32 authentication credentials",
      401
    );
  }

  const incomingHash = hashControllerToken(rawToken);
  const clientIp = getClientIp(request);
  await connectDB();

  // Rate limits remain per request; only the expensive controller/token lookup is cached.
  await Promise.all([
    enforceRateLimit(`esp32_ip:${clientIp}`, {
      maxRequests: Math.max(maxRequests * 4, 240),
      windowMs,
    }),
    enforceRateLimit(
      deviceRateLimitKeyPrefix === "esp32_auth"
        ? `esp32_auth:${clientIp}:${esp32DeviceId}`
        : `${deviceRateLimitKeyPrefix}:${esp32DeviceId}`,
      { maxRequests, windowMs }
    ),
  ]);

  const now = new Date();
  const cacheKey = `${esp32DeviceId}:${incomingHash}`;
  const cachedEntry = controllerAuthCache.get(cacheKey);
  let controller = cachedEntry && cachedEntry.expiresAt > Date.now()
    ? cachedEntry.controller
    : null;

  if (!controller) {
    controllerAuthCache.delete(cacheKey);
    controller = await Controller.findOne({ esp32DeviceId })
      .select("_id esp32DeviceId name homeId ownerId status +tokenHash +previousTokenHash previousTokenExpiresAt")
      .lean();

    const matchesPrimary = Boolean(controller?.tokenHash) &&
      timingSafeEqualStrings(incomingHash, controller.tokenHash);
    const matchesPrevious = Boolean(controller?.previousTokenHash) &&
      Boolean(controller?.previousTokenExpiresAt) &&
      new Date(controller.previousTokenExpiresAt) > now &&
      timingSafeEqualStrings(incomingHash, controller.previousTokenHash);

    if (!controller || controller.status !== "active" || (!matchesPrimary && !matchesPrevious)) {
      throw new ServiceError("Invalid or revoked ESP32 credentials", 401);
    }
    controllerAuthCache.set(cacheKey, { controller, expiresAt: Date.now() + CONTROLLER_AUTH_CACHE_MS });
  } else if (
    controller.status !== "active" ||
    (controller.previousTokenHash === incomingHash &&
      (!controller.previousTokenExpiresAt || new Date(controller.previousTokenExpiresAt) <= now))
  ) {
    controllerAuthCache.delete(cacheKey);
    throw new ServiceError("Invalid or revoked ESP32 credentials", 401);
  }

  return sanitizeControllerDoc(controller);
}

export async function provisionController(
  payload,
  { homeId, ownerId } = {}
) {
  assertValidObjectId(homeId, "homeId");
  assertValidObjectId(ownerId, "ownerId");

  const data = validateControllerProvisionPayload(payload);
  await connectDB();

  const existing = await Controller.exists({ esp32DeviceId: data.esp32DeviceId });
  if (existing) {
    throw new ServiceError(
      "An ESP32 controller with this esp32DeviceId already exists",
      409
    );
  }

  const { rawToken, tokenHash, tokenPrefix } = generateRawControllerToken();

  const created = await Controller.create({
    ...data,
    homeId,
    ownerId,
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

export async function listControllers({ homeId } = {}) {
  assertValidObjectId(homeId, "homeId");
  await connectDB();
  const list = await Controller.find({ homeId })
    .select(
      "_id esp32DeviceId name homeId ownerId tokenPrefix tokenVersion status relayConfig firmwareVersion lastRssi lastBootReason freeHeapBytes uptimeSeconds lastSeen createdAt updatedAt"
    )
    .sort({ createdAt: -1 })
    .lean();
  return list;
}

export async function updateControllerRelayConfig(
  idOrEspId,
  payload,
  { homeId } = {}
) {
  assertValidObjectId(homeId, "homeId");
  const lookup = buildControllerLookupQuery(idOrEspId);
  const updates = validateControllerPatchPayload(payload);
  await connectDB();

  const existing = await Controller.findOne(lookup)
    .select("_id homeId status")
    .lean();
  if (!existing) {
    throw new ServiceError("Controller not found", 404);
  }
  assertSameControllerHome(existing, homeId);

  const updated = await Controller.findByIdAndUpdate(
    existing._id,
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  ).lean();

  return sanitizeControllerDoc(updated);
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
  { homeId, graceMinutes = 15, now = new Date() } = {}
) {
  assertValidObjectId(homeId, "homeId");

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
  assertSameControllerHome(existing, homeId);

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

export async function revokeController(
  idOrEspId,
  { homeId, now = new Date() } = {}
) {
  assertValidObjectId(homeId, "homeId");
  const lookup = buildControllerLookupQuery(idOrEspId);
  await connectDB();

  const existing = await Controller.findOne(lookup).lean();
  if (!existing) {
    throw new ServiceError("Controller not found", 404);
  }
  assertSameControllerHome(existing, homeId);

  const updated = await Controller.findByIdAndUpdate(
    existing._id,
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

  invalidateVoiceCatalog(homeId);
  const offlineRes = await Device.updateMany(
    { esp32DeviceId: updated.esp32DeviceId, homeId: updated.homeId },
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
    expireStaleCommands({ esp32DeviceId: controller.esp32DeviceId, now }),
  ]);

  invalidateVoiceCatalog(String(controller.homeId));
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

  const [, boundDevices] = await Promise.all([
    Controller.updateOne({ _id: controller._id }, { $set: controllerSet }),
    Device.find({
      esp32DeviceId: controller.esp32DeviceId,
    })
      .select("_id name relayNumber desiredState")
      .lean(),
  ]);

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
