import { ServiceError } from "@/lib/utils/apiResponse";
import { assertValidObjectId } from "@/lib/utils/validation";
import {
  getAuthorizedHomeContext,
  verifyHomeMembership,
} from "@/services/ai/homeContextService";
import { toggleDeviceById } from "@/services/deviceService";

const ALLOWED_DEVICE_TYPES = new Set(["light", "fan", "led", "other"]);
const ALLOWED_CONN_STATUS = new Set(["online", "offline", "unknown"]);

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatDeviceSummary(d) {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    roomId: d.roomId,
    roomName: d.roomName,
    esp32DeviceId: d.esp32DeviceId,
    relayNumber: d.relayNumber,
    desiredState: d.desiredState,
    reportedState: d.reportedState,
    connectionStatus: d.connectionStatus,
    pendingHardwareAck: Boolean(
      d.esp32DeviceId && d.relayNumber && d.desiredState !== d.reportedState
    ),
    lastSeen: d.lastSeen,
  };
}

function resolveRooms(rooms, roomId, roomName) {
  if (roomId) {
    assertValidObjectId(roomId, "roomId");
    return rooms.filter((r) => String(r.id) === String(roomId));
  }
  const cleanRoom = normalize(roomName);
  if (!cleanRoom) return rooms;

  const exact = rooms.filter((r) => normalize(r.name) === cleanRoom);
  if (exact.length > 0) return exact;

  return rooms.filter((r) => normalize(r.name).includes(cleanRoom));
}

function resolveDevicesForTarget(
  devices,
  rooms,
  { deviceId, deviceName, roomId, roomName }
) {
  if (deviceId) {
    assertValidObjectId(deviceId, "deviceId");
    const byId = devices.filter((d) => String(d.id) === String(deviceId));
    if (byId.length === 0) {
      return { status: "not_found", matches: [] };
    }
    return { status: "resolved", matches: byId };
  }

  let scoped = devices;
  if (roomId || roomName) {
    const matchedRooms = resolveRooms(rooms, roomId, roomName);
    if (matchedRooms.length === 0) {
      return { status: "room_not_found", matches: [] };
    }
    const allowedRoomIds = new Set(matchedRooms.map((r) => r.id));
    scoped = devices.filter((d) => d.roomId && allowedRoomIds.has(d.roomId));
  }

  const cleanName = normalize(deviceName);
  if (!cleanName) {
    if (scoped.length === 1) return { status: "resolved", matches: scoped };
    if (scoped.length > 1) return { status: "ambiguous", matches: scoped };
    return { status: "not_found", matches: [] };
  }

  const exact = scoped.filter((d) => normalize(d.name) === cleanName);
  if (exact.length === 1) return { status: "resolved", matches: exact };
  if (exact.length > 1) return { status: "ambiguous", matches: exact };

  // Fallback substring or token match within scoped devices
  const partial = scoped.filter((d) => {
    const normDev = normalize(d.name);
    return normDev.includes(cleanName) || cleanName.includes(normDev);
  });
  if (partial.length === 1) return { status: "resolved", matches: partial };
  if (partial.length > 1) return { status: "ambiguous", matches: partial };

  return { status: "not_found", matches: [] };
}

export async function listHomeDevicesTool({
  homeId,
  userId,
  roomName,
  type,
  connectionStatus,
} = {}) {
  const ctx = await getAuthorizedHomeContext({ homeId, userId });
  let list = ctx.devices;

  if (roomName) {
    const matchedRooms = resolveRooms(ctx.rooms, null, roomName);
    const ids = new Set(matchedRooms.map((r) => r.id));
    list = list.filter((d) => d.roomId && ids.has(d.roomId));
  }

  if (type) {
    const cleanType = normalize(type);
    if (!ALLOWED_DEVICE_TYPES.has(cleanType)) {
      throw new ServiceError(
        "Invalid type filter. Allowed: light, fan, led, other",
        400
      );
    }
    list = list.filter((d) => normalize(d.type) === cleanType);
  }

  if (connectionStatus) {
    const cleanConn = normalize(connectionStatus);
    if (!ALLOWED_CONN_STATUS.has(cleanConn)) {
      throw new ServiceError(
        "Invalid connectionStatus filter. Allowed: online, offline, unknown",
        400
      );
    }
    list = list.filter((d) => normalize(d.connectionStatus) === cleanConn);
  }

  const counts = {
    total: list.length,
    online: list.filter((d) => d.connectionStatus === "online").length,
    offline: list.filter((d) => d.connectionStatus === "offline").length,
    unknown: list.filter((d) => d.connectionStatus === "unknown").length,
  };

  return {
    counts,
    devices: list.map(formatDeviceSummary),
  };
}

export async function getDeviceStatusTool({
  homeId,
  userId,
  deviceId,
  deviceName,
  roomName,
} = {}) {
  const ctx = await getAuthorizedHomeContext({ homeId, userId });
  const resolution = resolveDevicesForTarget(ctx.devices, ctx.rooms, {
    deviceId,
    deviceName,
    roomName,
  });

  if (resolution.status === "ambiguous") {
    return {
      status: "clarification",
      message: "Multiple devices matched. Ask the user to clarify which device.",
      candidates: resolution.matches.map(formatDeviceSummary),
    };
  }

  if (resolution.status !== "resolved") {
    return {
      status: "not_found",
      message: `No matching device was found in "${ctx.home.homeName}".`,
    };
  }

  return {
    status: "completed",
    device: formatDeviceSummary(resolution.matches[0]),
  };
}

/**
 * Tool-calling seam for controlling a single device. Never accepts unverified
 * device IDs directly and never alters reportedState; delegates strictly to toggleDeviceById.
 */
export async function executeDeviceCommandTool({
  homeId,
  userId,
  deviceId,
  deviceName,
  roomName,
  action,
  idempotencyKey,
} = {}) {
  await verifyHomeMembership({
    homeId,
    userId,
    allowedRoles: ["owner", "admin", "member"],
  });

  const cleanAction = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (cleanAction !== "on" && cleanAction !== "off") {
    throw new ServiceError('action must be "on" or "off"', 400);
  }

  if (!deviceId && !normalize(deviceName)) {
    throw new ServiceError("Either deviceId or deviceName is required", 400);
  }

  const ctx = await getAuthorizedHomeContext({ homeId, userId });
  const resolution = resolveDevicesForTarget(ctx.devices, ctx.rooms, {
    deviceId,
    deviceName,
    roomName,
  });

  if (resolution.status === "ambiguous") {
    return {
      executed: false,
      status: "clarification",
      message:
        "Multiple devices matched that description. Ask the user which specific device they meant.",
      candidates: resolution.matches.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        roomName: m.roomName,
      })),
    };
  }

  if (resolution.status !== "resolved") {
    return {
      executed: false,
      status: "not_found",
      message: `Could not find matching device in "${ctx.home.homeName}".`,
    };
  }

  const target = resolution.matches[0];

  try {
    const result = await toggleDeviceById(
      target.id,
      {
        desiredState: cleanAction,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      { homeId, ownerId: userId }
    );

    return {
      executed: true,
      status: "queued",
      deviceId: String(result.device._id),
      deviceName: result.device.name,
      roomName: target.roomName,
      desiredState: result.device.desiredState,
      reportedState: result.device.reportedState,
      connectionStatus: result.device.connectionStatus,
      commandId: result.command.commandId,
      commandStatus: result.command.status,
      idempotentReplay: result.idempotentReplay,
      hardwareConfirmed: false,
      note: `Command queued for ESP32 (${result.command.esp32DeviceId} Relay #${result.command.relayNumber}). reportedState remains "${result.device.reportedState}" until ESP32 hardware ACK.`,
      device: result.device,
    };
  } catch (err) {
    return {
      executed: false,
      status: "failed",
      deviceId: target.id,
      deviceName: target.name,
      error: err?.message || "Command failed to queue",
    };
  }
}

/**
 * Controls all devices of type "light" inside a specific authorized Room.
 */
export async function controlRoomLightsTool({
  homeId,
  userId,
  roomId,
  roomName,
  action,
} = {}) {
  await verifyHomeMembership({
    homeId,
    userId,
    allowedRoles: ["owner", "admin", "member"],
  });

  const cleanAction = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (cleanAction !== "on" && cleanAction !== "off") {
    throw new ServiceError('action must be "on" or "off"', 400);
  }

  const ctx = await getAuthorizedHomeContext({ homeId, userId });
  let matchedRooms;

  if (roomId) {
    matchedRooms = resolveRooms(ctx.rooms, roomId, null);
  } else if (normalize(roomName)) {
    matchedRooms = resolveRooms(ctx.rooms, null, roomName);
  } else if (ctx.rooms.length === 1) {
    matchedRooms = ctx.rooms;
  } else {
    return {
      executed: false,
      status: "clarification",
      message: "Specify which room's lights should be controlled.",
      candidates: ctx.rooms.map((r) => ({ id: r.id, name: r.name })),
    };
  }

  if (matchedRooms.length === 0) {
    return {
      executed: false,
      status: "not_found",
      message: `No matching room found in "${ctx.home.homeName}".`,
    };
  }

  if (matchedRooms.length > 1) {
    return {
      executed: false,
      status: "clarification",
      message: "Multiple rooms matched. Ask the user to clarify which room.",
      candidates: matchedRooms.map((r) => ({ id: r.id, name: r.name })),
    };
  }

  const targetRoom = matchedRooms[0];
  const lights = ctx.devices.filter(
    (d) => d.roomId === targetRoom.id && normalize(d.type) === "light"
  );

  if (lights.length === 0) {
    return {
      executed: false,
      status: "not_found",
      message: `No devices with type "light" exist in room "${targetRoom.name}".`,
    };
  }

  const settled = await Promise.allSettled(
    lights.map((light) =>
      toggleDeviceById(
        light.id,
        { desiredState: cleanAction },
        { homeId, ownerId: userId }
      )
    )
  );

  const results = [];
  const devices = [];
  let queuedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < lights.length; i++) {
    const dev = lights[i];
    const outcome = settled[i];
    if (outcome.status === "fulfilled" && outcome.value?.command) {
      queuedCount += 1;
      if (outcome.value.device) devices.push(outcome.value.device);
      results.push({
        deviceId: dev.id,
        deviceName: dev.name,
        status: "queued",
        commandId: outcome.value.command.commandId,
        action: cleanAction,
      });
    } else {
      failedCount += 1;
      results.push({
        deviceId: dev.id,
        deviceName: dev.name,
        status: "failed",
        error: outcome.reason?.message || "Failed to enqueue command",
      });
    }
  }

  return {
    executed: queuedCount > 0,
    status:
      queuedCount === 0 ? "failed" : failedCount > 0 ? "partial" : "queued",
    roomId: targetRoom.id,
    roomName: targetRoom.name,
    queuedCount,
    failedCount,
    hardwareConfirmed: false,
    note: `Room lights commands queued in "${targetRoom.name}". reportedState updates only after ESP32 ACK.`,
    results,
    devices,
  };
}
