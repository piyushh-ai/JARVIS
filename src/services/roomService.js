import { connectDB } from "@/lib/db/connect";
import { invalidateVoiceCatalog } from "@/services/ai/esp32VoiceCache";
import Room from "@/models/Room";
import Device from "@/models/Device";
import { ServiceError } from "@/lib/utils/apiResponse";
import {
  assertValidObjectId,
  validateCreateRoomPayload,
  validateUpdateRoomPayload,
} from "@/lib/utils/validation";

function assertSameHome(doc, homeId, resourceLabel = "Room") {
  if (!doc.homeId || String(doc.homeId) !== String(homeId)) {
    throw new ServiceError(
      `${resourceLabel} does not belong to your authorized home`,
      403
    );
  }
}

export async function listRooms({ homeId } = {}) {
  assertValidObjectId(homeId, "homeId");
  await connectDB();
  return Room.find({ homeId }).sort({ createdAt: -1 }).lean();
}

export async function createRoom(payload, { homeId, ownerId } = {}) {
  assertValidObjectId(homeId, "homeId");
  assertValidObjectId(ownerId, "ownerId");

  const roomData = validateCreateRoomPayload(payload);
  await connectDB();

  const room = await Room.create({
    ...roomData,
    homeId,
    ownerId,
  });
  invalidateVoiceCatalog(homeId);
  return room.toObject();
}

export async function getRoomById(id, { homeId } = {}) {
  assertValidObjectId(id, "room ID");
  assertValidObjectId(homeId, "homeId");
  await connectDB();

  const room = await Room.findById(id).lean();
  if (!room) {
    throw new ServiceError("Room not found", 404);
  }

  assertSameHome(room, homeId, "Room");
  return room;
}

export async function updateRoomById(id, payload, { homeId } = {}) {
  assertValidObjectId(id, "room ID");
  assertValidObjectId(homeId, "homeId");
  const updates = validateUpdateRoomPayload(payload);
  await connectDB();

  const existing = await Room.findById(id).lean();
  if (!existing) {
    throw new ServiceError("Room not found", 404);
  }
  assertSameHome(existing, homeId, "Room");

  const updated = await Room.findByIdAndUpdate(
    id,
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  ).lean();

  invalidateVoiceCatalog(homeId);
  return updated;
}

export async function deleteRoomById(id, { homeId } = {}) {
  assertValidObjectId(id, "room ID");
  assertValidObjectId(homeId, "homeId");
  await connectDB();

  const existing = await Room.findById(id).lean();
  if (!existing) {
    throw new ServiceError("Room not found", 404);
  }
  assertSameHome(existing, homeId, "Room");

  const attachedDevices = await Device.countDocuments({ roomId: id });
  if (attachedDevices > 0) {
    throw new ServiceError(
      `Cannot delete room while ${attachedDevices} device(s) are assigned to it`,
      409
    );
  }

  await Room.findByIdAndDelete(id);
  invalidateVoiceCatalog(homeId);
  return existing;
}
