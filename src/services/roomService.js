import { connectDB } from "@/lib/db/connect";
import Room from "@/models/Room";
import Device from "@/models/Device";
import { ServiceError } from "@/lib/utils/apiResponse";
import {
  assertValidObjectId,
  validateCreateRoomPayload,
  validateUpdateRoomPayload,
} from "@/lib/utils/validation";

export async function listRooms({ ownerId } = {}) {
  const query = {};
  if (ownerId) {
    assertValidObjectId(ownerId, "ownerId");
    query.ownerId = ownerId;
  }

  await connectDB();
  return Room.find(query).sort({ createdAt: -1 }).lean();
}

export async function createRoom(payload) {
  const roomData = validateCreateRoomPayload(payload);
  await connectDB();

  const room = await Room.create(roomData);
  return room.toObject();
}

export async function getRoomById(id) {
  assertValidObjectId(id, "room ID");
  await connectDB();

  const room = await Room.findById(id).lean();
  if (!room) {
    throw new ServiceError("Room not found", 404);
  }

  return room;
}

export async function updateRoomById(id, payload) {
  assertValidObjectId(id, "room ID");
  const updates = validateUpdateRoomPayload(payload);
  await connectDB();

  const updated = await Room.findByIdAndUpdate(
    id,
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  ).lean();

  if (!updated) {
    throw new ServiceError("Room not found", 404);
  }

  return updated;
}

export async function deleteRoomById(id) {
  assertValidObjectId(id, "room ID");
  await connectDB();

  const existing = await Room.findById(id).lean();
  if (!existing) {
    throw new ServiceError("Room not found", 404);
  }

  const attachedDevices = await Device.countDocuments({ roomId: id });
  if (attachedDevices > 0) {
    throw new ServiceError(
      `Cannot delete room while ${attachedDevices} device(s) are assigned to it`,
      409
    );
  }

  await Room.findByIdAndDelete(id);
  return existing;
}

