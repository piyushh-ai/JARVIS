import { connectDB } from "@/lib/db/connect";
import Controller from "@/models/Controller";
import Device from "@/models/Device";
import Room from "@/models/Room";
import { ServiceError } from "@/lib/utils/apiResponse";
import {
  assertValidObjectId,
  validateCreateDevicePayload,
  validateDeviceQueryFilters,
  validateToggleDevicePayload,
  validateUpdateDevicePayload,
} from "@/lib/utils/validation";
import { enqueueCommand } from "@/services/commandService";

function assertSameHome(doc, homeId, resourceLabel = "Resource") {
  if (!doc.homeId || String(doc.homeId) !== String(homeId)) {
    throw new ServiceError(
      `${resourceLabel} does not belong to your authorized home`,
      403
    );
  }
}

async function assertHardwareMappingAllowed({
  esp32DeviceId,
  relayNumber,
  homeId,
  excludeDeviceId = null,
}) {
  const hasEspId = typeof esp32DeviceId === "string" && esp32DeviceId.length > 0;
  const hasRelay = Number.isInteger(relayNumber);

  if (hasRelay && !hasEspId) {
    throw new ServiceError(
      "Select an ESP32 controller before assigning a relay number",
      400
    );
  }

  if (!hasEspId) return;

  const controller = await Controller.findOne({ esp32DeviceId })
    .select("_id homeId status")
    .lean();
  if (!controller) {
    throw new ServiceError(
      "Referenced ESP32 controller is not registered. Provision the controller first.",
      404
    );
  }
  assertSameHome(controller, homeId, "Referenced ESP32 controller");
  if (controller.status === "revoked") {
    throw new ServiceError(
      "Cannot map device to a revoked ESP32 controller",
      409
    );
  }

  if (hasRelay) {
    const duplicateQuery = {
      esp32DeviceId,
      relayNumber,
      ...(excludeDeviceId ? { _id: { $ne: excludeDeviceId } } : {}),
    };
    const conflict = await Device.findOne(duplicateQuery).select("name").lean();
    if (conflict) {
      throw new ServiceError(
        `Relay #${relayNumber} on controller "${esp32DeviceId}" is already assigned to "${conflict.name}"`,
        409
      );
    }
  }
}

export async function listDevices(filters = {}, { homeId } = {}) {
  assertValidObjectId(homeId, "homeId");
  const query = validateDeviceQueryFilters(filters);
  query.homeId = homeId;
  await connectDB();

  return Device.find(query).sort({ createdAt: -1 }).lean();
}

export async function createDevice(payload, { homeId, ownerId } = {}) {
  assertValidObjectId(homeId, "homeId");
  assertValidObjectId(ownerId, "ownerId");

  const deviceData = validateCreateDevicePayload(payload);
  await connectDB();

  const room = await Room.findById(deviceData.roomId).lean();
  if (!room) {
    throw new ServiceError("Referenced room not found", 404);
  }
  assertSameHome(room, homeId, "Referenced room");

  await assertHardwareMappingAllowed({
    esp32DeviceId: deviceData.esp32DeviceId ?? null,
    relayNumber: deviceData.relayNumber ?? null,
    homeId: room.homeId,
  });

  const device = await Device.create({
    ...deviceData,
    homeId: room.homeId,
    ownerId,
  });

  return device.toObject();
}

export async function getDeviceById(id, { homeId } = {}) {
  assertValidObjectId(id, "device ID");
  assertValidObjectId(homeId, "homeId");
  await connectDB();

  const device = await Device.findById(id).lean();
  if (!device) {
    throw new ServiceError("Device not found", 404);
  }

  assertSameHome(device, homeId, "Device");
  return device;
}

export async function updateDeviceById(
  id,
  payload,
  { homeId, userRole } = {}
) {
  assertValidObjectId(id, "device ID");
  assertValidObjectId(homeId, "homeId");

  const updates = validateUpdateDevicePayload(payload);

  if (userRole === "member") {
    const updateKeys = Object.keys(updates);
    if (updateKeys.some((key) => key !== "desiredState")) {
      throw new ServiceError(
        "Members can only update desiredState; structural device edits require admin or owner role",
        403
      );
    }
  }

  await connectDB();

  const existing = await Device.findById(id).lean();
  if (!existing) {
    throw new ServiceError("Device not found", 404);
  }
  assertSameHome(existing, homeId, "Device");

  if (updates.roomId) {
    const targetRoom = await Room.findById(updates.roomId).lean();
    if (!targetRoom) {
      throw new ServiceError("Referenced room not found", 404);
    }
    assertSameHome(targetRoom, homeId, "Referenced room");
  }

  if (updates.esp32DeviceId !== undefined || updates.relayNumber !== undefined) {
    const nextEspId =
      updates.esp32DeviceId !== undefined
        ? updates.esp32DeviceId
        : existing.esp32DeviceId;
    const nextRelay =
      updates.relayNumber !== undefined
        ? updates.relayNumber
        : existing.relayNumber;

    await assertHardwareMappingAllowed({
      esp32DeviceId: nextEspId,
      relayNumber: nextRelay,
      homeId,
      excludeDeviceId: existing._id,
    });
  }

  const updated = await Device.findByIdAndUpdate(
    id,
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  ).lean();

  return updated;
}

/**
 * Toggles or sets desiredState and atomically enqueues a pending hardware Command
 * after verifying Home ownership, valid relay mapping, and active ESP32 controller status.
 * Never mutates reportedState or connectionStatus.
 */
export async function toggleDeviceById(
  id,
  payload = {},
  { homeId, ownerId, now = new Date() } = {}
) {
  assertValidObjectId(id, "device ID");
  assertValidObjectId(homeId, "homeId");
  assertValidObjectId(ownerId, "ownerId");

  const data = validateToggleDevicePayload(payload);
  await connectDB();

  const existing = await Device.findById(id).lean();
  if (!existing) {
    throw new ServiceError("Device not found", 404);
  }
  assertSameHome(existing, homeId, "Device");

  const nextAction =
    data.desiredState ?? (existing.desiredState === "on" ? "off" : "on");

  const { command, idempotentReplay, supersededByNewer } = await enqueueCommand(
    {
      deviceId: String(existing._id),
      action: nextAction,
      relayNumber: existing.relayNumber,
      ttlSeconds: data.ttlSeconds,
      ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
    },
    { homeId, ownerId, now, prefetchedDevice: existing }
  );

  const updatedDevice = supersededByNewer
    ? await Device.findById(existing._id).lean()
    : await Device.findByIdAndUpdate(
        existing._id,
        { $set: { desiredState: command.action } },
        { returnDocument: "after", runValidators: true }
      ).lean();

  return {
    device: updatedDevice,
    command,
    idempotentReplay,
  };
}

export async function deleteDeviceById(id, { homeId } = {}) {
  assertValidObjectId(id, "device ID");
  assertValidObjectId(homeId, "homeId");
  await connectDB();

  const existing = await Device.findById(id).lean();
  if (!existing) {
    throw new ServiceError("Device not found", 404);
  }
  assertSameHome(existing, homeId, "Device");

  await Device.findByIdAndDelete(id);
  return existing;
}
