import mongoose from "mongoose";
import { ServiceError } from "@/lib/utils/apiResponse";

/**
 * Temporary development-only owner ObjectId used until authentication supplies session.user.id.
 */
export const DEFAULT_DEV_OWNER_ID = "000000000000000000000001";

export const DEVICE_TYPES = ["light", "fan", "led", "other"];
export const DEVICE_DESIRED_STATES = ["on", "off"];
export const COMMAND_ACTIONS = ["on", "off"];
export const COMMAND_STATUSES = [
  "pending",
  "processing",
  "success",
  "failed",
  "expired",
];
export const HARDWARE_REPORTED_STATES = ["on", "off", "unknown"];

const COMMAND_UUID_REGEX =
  /^cmd_[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

export async function parseJsonBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ServiceError("Request body must be valid JSON", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ServiceError("Request body must be a JSON object", 400);
  }

  return body;
}

export function assertValidObjectId(value, label = "ID") {
  if (
    typeof value !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(value) ||
    !mongoose.isValidObjectId(value)
  ) {
    throw new ServiceError(`Invalid ${label}`, 400);
  }
}

function assertCleanText(value, fieldName, { required = false, max = 100 } = {}) {
  if (value === undefined) {
    if (required) {
      throw new ServiceError(`${fieldName} is required`, 400);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ServiceError(`${fieldName} must be a string`, 400);
  }

  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new ServiceError(`${fieldName} cannot be empty`, 400);
  }

  if (trimmed.length > max) {
    throw new ServiceError(
      `${fieldName} cannot exceed ${max} characters`,
      400
    );
  }

  return trimmed;
}

function validateRelayNumber(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 32
  ) {
    throw new ServiceError(
      "relayNumber must be a whole integer between 1 and 32",
      400
    );
  }

  return value;
}

function validateEsp32DeviceId(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (typeof value !== "string") {
    throw new ServiceError("esp32DeviceId must be a string or null", 400);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 100) {
    throw new ServiceError(
      "esp32DeviceId cannot exceed 100 characters",
      400
    );
  }

  return trimmed;
}

export function validateCreateRoomPayload(body) {
  const name = assertCleanText(body.name, "Room name", {
    required: true,
    max: 80,
  });

  const description = assertCleanText(body.description, "Description", {
    required: false,
    max: 300,
  });

  let ownerId = DEFAULT_DEV_OWNER_ID;
  if (body.ownerId !== undefined) {
    assertValidObjectId(body.ownerId, "ownerId");
    ownerId = body.ownerId;
  }

  return {
    name,
    description: description ?? "",
    ownerId,
  };
}

export function validateUpdateRoomPayload(body) {
  const updates = {};

  if (body.name !== undefined) {
    updates.name = assertCleanText(body.name, "Room name", {
      required: true,
      max: 80,
    });
  }

  if (body.description !== undefined) {
    updates.description = assertCleanText(body.description, "Description", {
      required: false,
      max: 300,
    });
  }

  if (Object.keys(updates).length === 0) {
    throw new ServiceError(
      "Provide at least one permitted field to update (name or description)",
      400
    );
  }

  return updates;
}

function assertEnumValue(value, allowed, fieldName) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ServiceError(
      `Invalid ${fieldName}. Allowed values: ${allowed.join(", ")}`,
      400
    );
  }
  return value;
}

export function validateCreateDevicePayload(body) {
  const name = assertCleanText(body.name, "Device name", {
    required: true,
    max: 80,
  });

  if (body.roomId === undefined) {
    throw new ServiceError("roomId is required", 400);
  }
  assertValidObjectId(body.roomId, "roomId");

  const type =
    body.type !== undefined
      ? assertEnumValue(body.type, DEVICE_TYPES, "device type")
      : "other";

  const desiredState =
    body.desiredState !== undefined
      ? assertEnumValue(body.desiredState, DEVICE_DESIRED_STATES, "desiredState")
      : "off";

  const esp32DeviceId = validateEsp32DeviceId(body.esp32DeviceId);
  const relayNumber = validateRelayNumber(body.relayNumber);

  return {
    name,
    roomId: body.roomId,
    type,
    desiredState,
    ...(esp32DeviceId !== undefined ? { esp32DeviceId } : {}),
    ...(relayNumber !== undefined ? { relayNumber } : {}),
  };
}

export function validateUpdateDevicePayload(body) {
  const updates = {};

  if (body.name !== undefined) {
    updates.name = assertCleanText(body.name, "Device name", {
      required: true,
      max: 80,
    });
  }

  if (body.type !== undefined) {
    updates.type = assertEnumValue(body.type, DEVICE_TYPES, "device type");
  }

  if (body.roomId !== undefined) {
    assertValidObjectId(body.roomId, "roomId");
    updates.roomId = body.roomId;
  }

  if (body.desiredState !== undefined) {
    updates.desiredState = assertEnumValue(
      body.desiredState,
      DEVICE_DESIRED_STATES,
      "desiredState"
    );
  }

  if (body.esp32DeviceId !== undefined) {
    updates.esp32DeviceId = validateEsp32DeviceId(body.esp32DeviceId);
  }

  if (body.relayNumber !== undefined) {
    updates.relayNumber = validateRelayNumber(body.relayNumber);
  }

  if (Object.keys(updates).length === 0) {
    throw new ServiceError(
      "Provide at least one permitted field to update (name, type, roomId, esp32DeviceId, relayNumber, desiredState)",
      400
    );
  }

  return updates;
}

export function validateDeviceQueryFilters({ roomId, type } = {}) {
  const query = {};

  if (roomId) {
    assertValidObjectId(roomId, "roomId");
    query.roomId = roomId;
  }

  if (type) {
    query.type = assertEnumValue(type, DEVICE_TYPES, "device type filter");
  }

  return query;
}

export function assertValidCommandId(value) {
  if (typeof value !== "string") {
    throw new ServiceError("Invalid command ID", 400);
  }

  const trimmed = value.trim();
  const isObjectId =
    /^[a-fA-F0-9]{24}$/.test(trimmed) && mongoose.isValidObjectId(trimmed);
  const isCommandUuid = COMMAND_UUID_REGEX.test(trimmed);

  if (!isObjectId && !isCommandUuid) {
    throw new ServiceError("Invalid command ID", 400);
  }

  return {
    value: trimmed,
    field: isCommandUuid ? "commandId" : "_id",
  };
}

export function normalizeCommandAction(value) {
  if (typeof value !== "string") {
    throw new ServiceError("Action is required (on or off)", 400);
  }
  const normalized = value.trim().toLowerCase();
  if (!COMMAND_ACTIONS.includes(normalized)) {
    throw new ServiceError("Invalid action. Allowed values: on, off", 400);
  }
  return normalized;
}

export function validateCreateCommandPayload(body) {
  if (body.deviceId === undefined) {
    throw new ServiceError("deviceId is required", 400);
  }
  assertValidObjectId(body.deviceId, "deviceId");

  const action = normalizeCommandAction(body.action ?? body.requestedAction);

  let relayNumber;
  if (body.relayNumber !== undefined) {
    if (body.relayNumber === null) {
      throw new ServiceError(
        "relayNumber must be a whole integer between 1 and 32",
        400
      );
    }
    relayNumber = validateRelayNumber(body.relayNumber);
  }

  let ttlSeconds = 90;
  if (body.ttlSeconds !== undefined) {
    if (
      typeof body.ttlSeconds !== "number" ||
      !Number.isFinite(body.ttlSeconds) ||
      !Number.isInteger(body.ttlSeconds) ||
      body.ttlSeconds < 5 ||
      body.ttlSeconds > 3600
    ) {
      throw new ServiceError(
        "ttlSeconds must be a whole integer between 5 and 3600",
        400
      );
    }
    ttlSeconds = body.ttlSeconds;
  }

  let idempotencyKey = null;
  if (body.idempotencyKey !== undefined && body.idempotencyKey !== null) {
    const cleaned = assertCleanText(body.idempotencyKey, "idempotencyKey", {
      required: false,
      max: 128,
    });
    idempotencyKey = cleaned || null;
  }

  return {
    deviceId: body.deviceId,
    action,
    ...(relayNumber !== undefined ? { relayNumber } : {}),
    ttlSeconds,
    idempotencyKey,
  };
}

export function validateCommandQueryFilters({
  deviceId,
  esp32DeviceId,
  status,
  limit,
} = {}) {
  const query = {};

  if (deviceId) {
    assertValidObjectId(deviceId, "deviceId");
    query.deviceId = deviceId;
  }

  if (esp32DeviceId !== undefined) {
    const cleanedEsp = validateEsp32DeviceId(esp32DeviceId);
    if (cleanedEsp) {
      query.esp32DeviceId = cleanedEsp;
    }
  }

  if (status) {
    query.status = assertEnumValue(
      status.trim().toLowerCase(),
      COMMAND_STATUSES,
      "command status filter"
    );
  }

  let parsedLimit = 50;
  if (limit !== undefined && limit !== null && limit !== "") {
    const num = typeof limit === "number" ? limit : Number(limit);
    if (!Number.isInteger(num) || num < 1 || num > 100) {
      throw new ServiceError(
        "limit must be a whole integer between 1 and 100",
        400
      );
    }
    parsedLimit = num;
  }

  return { query, limit: parsedLimit };
}
