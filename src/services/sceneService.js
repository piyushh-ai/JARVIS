import { connectDB } from "@/lib/db/connect";
import { ServiceError } from "@/lib/utils/apiResponse";
import { assertValidObjectId } from "@/lib/utils/validation";
import { SMART_SCENES, SMART_SCENES_BY_ID } from "@/lib/scenes/sceneDefinitions";
import Command from "@/models/Command";
import Device from "@/models/Device";
import RateLimit from "@/models/RateLimit";
import { toggleDeviceById } from "@/services/deviceService";

const SCENE_DUPLICATE_GUARD_MS = 2500;

function normalizeDeviceName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveNamedDevice(devices, targetLabel, fallbackPattern) {
  const exactKey = normalizeDeviceName(targetLabel);
  const exact = devices.find((d) => normalizeDeviceName(d.name) === exactKey);
  if (exact) return exact;
  return devices.find((d) => fallbackPattern.test(String(d.name || ""))) || null;
}

export function listScenes() {
  return SMART_SCENES;
}

/**
 * Dynamically resolves MongoDB devices in a Home for a given scene preset.
 * Never mutates state directly; returns exact device/action targets and any
 * expected named targets that are missing in the Home.
 */
export function resolveSceneTargets(sceneId, homeDevices = []) {
  const scene = SMART_SCENES_BY_ID[sceneId];
  if (!scene) {
    throw new ServiceError(`Unknown smart scene "${sceneId}"`, 404);
  }

  const devices = Array.isArray(homeDevices) ? homeDevices : [];
  const targets = [];
  const missingTargets = [];
  const seenIds = new Set();

  const pushTarget = (device, action) => {
    if (!device?._id) return;
    const key = String(device._id);
    if (seenIds.has(key)) return;
    seenIds.add(key);
    targets.push({ device, action });
  };

  if (scene.targetMode === "named_lights_on") {
    const morningSpecs = [
      { label: "Main Light", pattern: /\bmain\s*light\b/i },
      { label: "Mandir Light", pattern: /\bmandir\s*light\b/i },
    ];
    for (const spec of morningSpecs) {
      const match = resolveNamedDevice(devices, spec.label, spec.pattern);
      if (match) {
        pushTarget(match, "on");
      } else {
        missingTargets.push({ label: spec.label, action: "on" });
      }
    }
    return { scene, targets, missingTargets };
  }

  if (scene.targetMode === "all_devices_off") {
    for (const dev of devices) {
      pushTarget(dev, "off");
    }
    return { scene, targets, missingTargets };
  }

  if (scene.targetMode === "type_light_on" || scene.targetMode === "type_light_off") {
    const action = scene.targetMode === "type_light_on" ? "on" : "off";
    for (const dev of devices) {
      if (String(dev.type || "").toLowerCase() === "light") {
        pushTarget(dev, action);
      }
    }
    return { scene, targets, missingTargets };
  }

  throw new ServiceError(`Unsupported scene mode for "${sceneId}"`, 400);
}

async function acquireSceneCooldownLock(lockKey, now, ttlMs) {
  const expiresAt = new Date(now.getTime() + ttlMs);
  try {
    return await RateLimit.findOneAndUpdate(
      {
        key: lockKey,
        $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }],
      },
      { $set: { count: 1, expiresAt } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: false }
    ).lean();
  } catch (err) {
    if (err?.code === 11000) {
      return null;
    }
    throw err;
  }
}

/**
 * Executes a Smart Scene dynamically across a Home's MongoDB devices strictly through
 * the existing toggleDeviceById -> Command queue pipeline.
 * Supports idempotencyKey replay, distributed duplicate-execution cooldown locking,
 * and structured partial failure reporting without ever modifying reportedState.
 */
export async function executeScene(
  sceneId,
  { homeId, ownerId, idempotencyKey, now = new Date() } = {}
) {
  const cleanSceneId = typeof sceneId === "string" ? sceneId.trim().toLowerCase() : "";
  const scene = SMART_SCENES_BY_ID[cleanSceneId];
  if (!scene) {
    throw new ServiceError("Smart scene not found", 404);
  }

  assertValidObjectId(homeId, "homeId");
  assertValidObjectId(ownerId, "ownerId");

  let cleanIdemKey = null;
  if (idempotencyKey !== undefined && idempotencyKey !== null && idempotencyKey !== "") {
    if (typeof idempotencyKey !== "string") {
      throw new ServiceError("idempotencyKey must be a string", 400);
    }
    cleanIdemKey = idempotencyKey.trim();
    if (!cleanIdemKey || cleanIdemKey.length > 80) {
      throw new ServiceError(
        "idempotencyKey must be between 1 and 80 characters",
        400
      );
    }
  }

  await connectDB();

  const homeDevices = await Device.find({ homeId })
    .sort({ relayNumber: 1, createdAt: 1 })
    .lean();

  const { targets, missingTargets } = resolveSceneTargets(cleanSceneId, homeDevices);

  if (targets.length === 0) {
    const hint =
      scene.targetMode === "type_light_on" || scene.targetMode === "type_light_off"
        ? 'No devices with type "light" were found in your active home'
        : scene.targetMode === "named_lights_on"
          ? 'Could not find "Main Light" or "Mandir Light" in your active home'
          : "No devices were found in your active home";
    throw new ServiceError(hint, 404);
  }

  // Allow exact HTTP retries with the same idempotencyKey without hitting cooldown 409
  const perDeviceKeys = cleanIdemKey
    ? targets.map((t) => `${cleanIdemKey}:${t.device._id}`)
    : [];

  let isRetryWithExistingKey = false;
  if (perDeviceKeys.length > 0) {
    const existingHit = await Command.exists({
      homeId,
      idempotencyKey: { $in: perDeviceKeys },
    });
    isRetryWithExistingKey = Boolean(existingHit);
  }

  const lockKey = `scene_exec:${homeId}:${cleanSceneId}`;
  let acquiredLock = false;
  if (!isRetryWithExistingKey) {
    const lock = await acquireSceneCooldownLock(
      lockKey,
      now,
      SCENE_DUPLICATE_GUARD_MS
    );
    if (!lock) {
      throw new ServiceError(
        `Scene "${scene.name}" was just triggered. Wait a moment before running it again.`,
        409
      );
    }
    acquiredLock = true;
  }

  // Execute every resolved device strictly through existing command pipeline
  const settled = await Promise.allSettled(
    targets.map((target) => {
      const perDeviceKey = cleanIdemKey
        ? `${cleanIdemKey}:${target.device._id}`
        : undefined;
      return toggleDeviceById(
        String(target.device._id),
        {
          desiredState: target.action,
          ...(perDeviceKey ? { idempotencyKey: perDeviceKey } : {}),
        },
        { homeId, ownerId, now }
      );
    })
  );

  const results = [];
  const updatedDevices = [];
  let queuedCount = 0;
  let failedCount = 0;
  let idempotentReplayCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const { device, action } = targets[i];
    const outcome = settled[i];

    if (outcome.status === "fulfilled" && outcome.value?.command) {
      queuedCount += 1;
      if (outcome.value.idempotentReplay) {
        idempotentReplayCount += 1;
      }
      if (outcome.value.device) {
        updatedDevices.push(outcome.value.device);
      }
      results.push({
        deviceId: String(device._id),
        deviceName: device.name,
        deviceType: device.type,
        esp32DeviceId: device.esp32DeviceId || null,
        relayNumber: device.relayNumber ?? null,
        action,
        status: "queued",
        commandId: outcome.value.command.commandId,
        commandStatus: outcome.value.command.status,
        idempotentReplay: Boolean(outcome.value.idempotentReplay),
        error: null,
      });
    } else {
      failedCount += 1;
      const reasonMsg =
        outcome.status === "rejected"
          ? outcome.reason?.message || "Failed to enqueue command"
          : "Command pipeline did not return a queued command";
      results.push({
        deviceId: String(device._id),
        deviceName: device.name,
        deviceType: device.type,
        esp32DeviceId: device.esp32DeviceId || null,
        relayNumber: device.relayNumber ?? null,
        action,
        status: "failed",
        commandId: null,
        commandStatus: null,
        idempotentReplay: false,
        error: reasonMsg,
      });
    }
  }

  for (const missing of missingTargets) {
    failedCount += 1;
    results.push({
      deviceId: null,
      deviceName: missing.label,
      deviceType: "light",
      esp32DeviceId: null,
      relayNumber: null,
      action: missing.action,
      status: "failed",
      commandId: null,
      commandStatus: null,
      idempotentReplay: false,
      error: `Device "${missing.label}" was not found in this home`,
    });
  }

  if (queuedCount === 0) {
    if (acquiredLock) {
      await RateLimit.deleteOne({ key: lockKey }).catch(() => {});
    }
    const failureDetails = results.map((r) => `${r.deviceName}: ${r.error}`);
    throw new ServiceError(
      `Scene "${scene.name}" failed on all ${failedCount} device(s): ${results[0]?.error || "Command dispatch failed"}`,
      422,
      failureDetails
    );
  }

  return {
    scene,
    outcome: failedCount > 0 ? "partial" : "success",
    totalTargets: targets.length + missingTargets.length,
    queuedCount,
    failedCount,
    idempotentReplayCount,
    executedAt: now.toISOString(),
    results,
    devices: updatedDevices,
  };
}

