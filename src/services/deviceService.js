import { connectDB } from "@/lib/db/connect";
import Device from "@/models/Device";
import Room from "@/models/Room";
import { ServiceError } from "@/lib/utils/apiResponse";
import {
  assertValidObjectId,
  validateCreateDevicePayload,
  validateDeviceQueryFilters,
  validateUpdateDevicePayload,
} from "@/lib/utils/validation";

export async function listDevices(filters = {}) {
  const query = validateDeviceQueryFilters(filters);
  await connectDB();

  return Device.find(query).sort({ createdAt: -1 }).lean();
}

export async function createDevice(payload) {
  const deviceData = validateCreateDevicePayload(payload);
  await connectDB();

  const room = await Room.findById(deviceData.roomId).lean();
  if (!room) {
    throw new ServiceError("Referenced room not found", 404);
  }

  // Inherit ownerId from the verified room; hardware fields keep safe defaults
  // (desiredState does not assert physical reportedState).
  const device = await Device.create({
    ...deviceData,
    ownerId: room.ownerId,
  });

  return device.toObject();
}

export async function getDeviceById(id) {
  assertValidObjectId(id, "device ID");
  await connectDB();

  const device = await Device.findById(id).lean();
  if (!device) {
    throw new ServiceError("Device not found", 404);
  }

  return device;
}

export async function updateDeviceById(id, payload) {
  assertValidObjectId(id, "device ID");
  const updates = validateUpdateDevicePayload(payload);
  await connectDB();

  const existing = await Device.exists({ _id: id });
  if (!existing) {
    throw new ServiceError("Device not found", 404);
  }

  if (updates.roomId) {
    const targetRoom = await Room.findById(updates.roomId).lean();
    if (!targetRoom) {
      throw new ServiceError("Referenced room not found", 404);
    }
    updates.ownerId = targetRoom.ownerId;
  }

  const updated = await Device.findByIdAndUpdate(
    id,
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  ).lean();

  return updated;
}

export async function deleteDeviceById(id) {
  assertValidObjectId(id, "device ID");
  await connectDB();

  const deleted = await Device.findByIdAndDelete(id).lean();
  if (!deleted) {
    throw new ServiceError("Device not found", 404);
  }

  return deleted;
}

