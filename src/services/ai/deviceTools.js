import { ServiceError } from "@/lib/utils/apiResponse";
import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { listDevices, toggleDeviceById } from "@/services/deviceService";

export async function listHomeDevicesTool({
  homeId,
  userId,
  roomId,
  type,
} = {}) {
  await verifyHomeMembership({ homeId, userId });
  const devices = await listDevices({ roomId, type }, { homeId });

  return devices.map((d) => ({
    id: String(d._id),
    name: d.name,
    type: d.type,
    roomId: d.roomId ? String(d.roomId) : null,
    esp32DeviceId: d.esp32DeviceId || null,
    relayNumber: d.relayNumber ?? null,
    desiredState: d.desiredState,
    reportedState: d.reportedState,
    connectionStatus: d.connectionStatus,
    lastSeen: d.lastSeen || null,
  }));
}

/**
 * Tool-calling seam for future LangChain/LangGraph agents to control devices.
 * Strictly validates Home membership and routes exclusively through toggleDeviceById
 * so Command creation, hardware mapping checks, and desired vs reported semantics hold.
 */
export async function executeDeviceCommandTool({
  homeId,
  userId,
  deviceId,
  action,
  idempotencyKey,
} = {}) {
  await verifyHomeMembership({
    homeId,
    userId,
    allowedRoles: ["owner", "admin", "member"],
  });

  if (action !== "on" && action !== "off") {
    throw new ServiceError('action must be "on" or "off"', 400);
  }

  const result = await toggleDeviceById(
    deviceId,
    {
      desiredState: action,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
    { homeId, ownerId: userId }
  );

  return {
    deviceId: String(result.device._id),
    name: result.device.name,
    desiredState: result.device.desiredState,
    reportedState: result.device.reportedState,
    connectionStatus: result.device.connectionStatus,
    commandId: result.command.commandId,
    commandStatus: result.command.status,
    idempotentReplay: result.idempotentReplay,
  };
}

