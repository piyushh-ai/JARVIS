import { connectDB } from "@/lib/db/connect";
import { ServiceError } from "@/lib/utils/apiResponse";
import { assertValidObjectId } from "@/lib/utils/validation";
import Controller from "@/models/Controller";
import Device from "@/models/Device";
import Home from "@/models/Home";
import Room from "@/models/Room";

export async function verifyHomeMembership({
  homeId,
  userId,
  allowedRoles = ["owner", "admin", "member"],
} = {}) {
  assertValidObjectId(homeId, "homeId");
  assertValidObjectId(userId, "userId");
  await connectDB();

  const home = await Home.findById(homeId)
    .select("_id name ownerId members")
    .lean();
  if (!home) {
    throw new ServiceError("Home not found", 404);
  }

  let role = null;
  if (String(home.ownerId) === String(userId)) {
    role = "owner";
  } else if (Array.isArray(home.members)) {
    const member = home.members.find(
      (entry) => String(entry.userId) === String(userId)
    );
    role = member?.role || null;
  }

  if (!role) {
    throw new ServiceError("You do not have access to this home", 403);
  }
  if (Array.isArray(allowedRoles) && !allowedRoles.includes(role)) {
    throw new ServiceError(
      "You do not have permission to perform this action in this home",
      403
    );
  }

  return {
    homeId: String(home._id),
    homeName: home.name,
    role,
  };
}

/**
 * Returns a strict, secret-free Home context snapshot for future RAG and
 * LangGraph tool execution, strictly scoped to the verified Home.
 */
export async function getAuthorizedHomeContext({ homeId, userId } = {}) {
  const membership = await verifyHomeMembership({ homeId, userId });

  const [rooms, devices, controllers] = await Promise.all([
    Room.find({ homeId })
      .select("_id name description floor")
      .sort({ name: 1 })
      .lean(),
    Device.find({ homeId })
      .select(
        "_id name type roomId esp32DeviceId relayNumber desiredState reportedState connectionStatus lastSeen"
      )
      .sort({ name: 1 })
      .lean(),
    Controller.find({ homeId })
      .select(
        "_id esp32DeviceId name status relayConfig.relayNumber relayConfig.gpioPin relayConfig.activeLevel relayConfig.safeBootState lastSeen"
      )
      .sort({ name: 1 })
      .lean(),
  ]);

  const roomNameById = new Map(rooms.map((r) => [String(r._id), r.name]));

  return {
    home: membership,
    rooms: rooms.map((r) => ({
      id: String(r._id),
      name: r.name,
      description: r.description || "",
      floor: r.floor || "",
    })),
    devices: devices.map((d) => ({
      id: String(d._id),
      name: d.name,
      type: d.type,
      roomId: d.roomId ? String(d.roomId) : null,
      roomName: d.roomId ? roomNameById.get(String(d.roomId)) || null : null,
      esp32DeviceId: d.esp32DeviceId || null,
      relayNumber: d.relayNumber ?? null,
      desiredState: d.desiredState,
      reportedState: d.reportedState,
      connectionStatus: d.connectionStatus,
      lastSeen: d.lastSeen || null,
    })),
    controllers: controllers.map((c) => ({
      id: String(c._id),
      esp32DeviceId: c.esp32DeviceId,
      name: c.name,
      status: c.status,
      relayConfig: Array.isArray(c.relayConfig) ? c.relayConfig : [],
      lastSeen: c.lastSeen || null,
    })),
    generatedAt: new Date().toISOString(),
  };
}
