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

export async function parseOptionalJsonBody(request) {
  let rawText = "";
  try {
    rawText = await request.text();
  } catch {
    throw new ServiceError("Unable to read request body", 400);
  }

  if (!rawText || !rawText.trim()) {
    return {};
  }

  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    throw new ServiceError("Request body must be valid JSON", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ServiceError("Request body must be a JSON object", 400);
  }

  return body;
}

function assertOptionalBoundedNumber(value, fieldName, { min, max, integer = false } = {}) {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  ) {
    throw new ServiceError(
      `${fieldName} must be a valid ${integer ? "integer" : "number"}${
        min !== undefined && max !== undefined ? ` between ${min} and ${max}` : ""
      }`,
      400
    );
  }
  return value;
}

function validateRelayConfigList(relayConfig) {
  if (relayConfig === undefined) return [];
  if (!Array.isArray(relayConfig) || relayConfig.length > 32) {
    throw new ServiceError(
      "relayConfig must be an array of at most 32 channel mappings",
      400
    );
  }

  const seenRelays = new Set();
  const seenPins = new Set();
  const normalized = [];

  for (const entry of relayConfig) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ServiceError("Each relayConfig entry must be an object", 400);
    }

    const relayNumber = validateRelayNumber(entry.relayNumber);
    if (!Number.isInteger(relayNumber)) {
      throw new ServiceError("Each relayConfig entry requires a relayNumber (1-32)", 400);
    }
    if (seenRelays.has(relayNumber)) {
      throw new ServiceError(`Duplicate relayNumber ${relayNumber} in relayConfig`, 400);
    }
    seenRelays.add(relayNumber);

    let gpioPin = null;
    if (entry.gpioPin !== undefined && entry.gpioPin !== null) {
      gpioPin = assertOptionalBoundedNumber(entry.gpioPin, "gpioPin", {
        min: 0,
        max: 39,
        integer: true,
      });
      if (seenPins.has(gpioPin)) {
        throw new ServiceError(`Duplicate gpioPin ${gpioPin} in relayConfig`, 400);
      }
      seenPins.add(gpioPin);
    }

    const activeLevel =
      entry.activeLevel !== undefined
        ? assertEnumValue(String(entry.activeLevel).trim().toUpperCase(), ["LOW", "HIGH"], "activeLevel")
        : "LOW";

    const safeBootState =
      entry.safeBootState !== undefined
        ? assertEnumValue(String(entry.safeBootState).trim().toLowerCase(), ["off"], "safeBootState")
        : "off";

    normalized.push({ relayNumber, gpioPin, activeLevel, safeBootState });
  }

  return normalized;
}

export function validateControllerProvisionPayload(body) {
  const esp32DeviceId = assertCleanText(body.esp32DeviceId, "esp32DeviceId", {
    required: true,
    max: 100,
  });

  const name = assertCleanText(body.name, "Controller name", {
    required: false,
    max: 80,
  });

  let ownerId = DEFAULT_DEV_OWNER_ID;
  if (body.ownerId !== undefined) {
    assertValidObjectId(body.ownerId, "ownerId");
    ownerId = body.ownerId;
  }

  const relayConfig = validateRelayConfigList(body.relayConfig);

  return {
    esp32DeviceId,
    name: name ?? "",
    ownerId,
    relayConfig,
  };
}

export function validateHeartbeatPayload(body = {}) {
  const firmwareVersion = assertCleanText(body.firmwareVersion, "firmwareVersion", {
    required: false,
    max: 40,
  });
  const rssi = assertOptionalBoundedNumber(body.rssi, "rssi", { min: -120, max: 0 });
  const uptimeSeconds = assertOptionalBoundedNumber(body.uptimeSeconds, "uptimeSeconds", {
    min: 0,
    max: 1e9,
  });
  const freeHeapBytes = assertOptionalBoundedNumber(body.freeHeapBytes, "freeHeapBytes", {
    min: 0,
    max: 1e8,
  });

  return {
    ...(firmwareVersion !== undefined ? { firmwareVersion } : {}),
    ...(rssi !== undefined ? { rssi } : {}),
    ...(uptimeSeconds !== undefined ? { uptimeSeconds } : {}),
    ...(freeHeapBytes !== undefined ? { freeHeapBytes } : {}),
  };
}

export function validateCommandAckPayload(body) {
  if (typeof body.status !== "string") {
    throw new ServiceError('Acknowledge status is required ("success" or "failed")', 400);
  }
  const status = assertEnumValue(
    body.status.trim().toLowerCase(),
    ["success", "failed"],
    "acknowledge status"
  );

  let reportedState;
  if (body.reportedState !== undefined && body.reportedState !== null) {
    if (typeof body.reportedState !== "string") {
      throw new ServiceError("reportedState must be a string", 400);
    }
    reportedState = assertEnumValue(
      body.reportedState.trim().toLowerCase(),
      HARDWARE_REPORTED_STATES,
      "reportedState"
    );
  }

  let relayNumber;
  if (body.relayNumber !== undefined && body.relayNumber !== null) {
    relayNumber = validateRelayNumber(body.relayNumber);
  }

  let executedAt;
  if (body.executedAt !== undefined && body.executedAt !== null) {
    const dt = new Date(body.executedAt);
    if (Number.isNaN(dt.getTime())) {
      throw new ServiceError("executedAt must be a valid timestamp", 400);
    }
    executedAt = dt;
  }

  const result = assertCleanText(body.result, "result", { required: false, max: 300 });
  const rawErr = body.errorReason !== undefined ? body.errorReason : body.failureReason;
  const errorReason = assertCleanText(rawErr, "errorReason", {
    required: false,
    max: 300,
  });

  return {
    status,
    ...(reportedState !== undefined ? { reportedState } : {}),
    ...(relayNumber !== undefined ? { relayNumber } : {}),
    ...(executedAt !== undefined ? { executedAt } : {}),
    ...(result !== undefined ? { result } : {}),
    ...(errorReason !== undefined ? { errorReason } : {}),
  };
}

export function validateEsp32StatusPayload(body) {
  const bootReason = assertCleanText(body.bootReason, "bootReason", {
    required: false,
    max: 80,
  });
  const firmwareVersion = assertCleanText(body.firmwareVersion, "firmwareVersion", {
    required: false,
    max: 40,
  });
  const rssi = assertOptionalBoundedNumber(body.rssi, "rssi", { min: -120, max: 0 });

  if (!Array.isArray(body.channels) || body.channels.length === 0 || body.channels.length > 32) {
    throw new ServiceError("channels must be a non-empty array (1 to 32 entries)", 400);
  }

  const seenRelays = new Set();
  const channels = [];

  for (const ch of body.channels) {
    if (!ch || typeof ch !== "object" || Array.isArray(ch)) {
      throw new ServiceError("Each channel entry must be an object", 400);
    }
    const relayNumber = validateRelayNumber(ch.relayNumber);
    if (!Number.isInteger(relayNumber)) {
      throw new ServiceError("Each channel requires a whole integer relayNumber (1-32)", 400);
    }
    if (seenRelays.has(relayNumber)) {
      throw new ServiceError(`Duplicate relayNumber ${relayNumber} in channels`, 400);
    }
    seenRelays.add(relayNumber);

    if (typeof ch.reportedState !== "string") {
      throw new ServiceError("Each channel requires a reportedState (on, off, unknown)", 400);
    }
    const reportedState = assertEnumValue(
      ch.reportedState.trim().toLowerCase(),
      HARDWARE_REPORTED_STATES,
      "reportedState"
    );

    channels.push({ relayNumber, reportedState });
  }

  return {
    ...(bootReason !== undefined ? { bootReason } : {}),
    ...(firmwareVersion !== undefined ? { firmwareVersion } : {}),
    ...(rssi !== undefined ? { rssi } : {}),
    channels,
  };
}
