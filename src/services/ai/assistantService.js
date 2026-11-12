import { connectDB } from "@/lib/db/connect";
import { SMART_SCENES, VALID_SCENE_IDS } from "@/lib/scenes/sceneDefinitions";
import { ServiceError } from "@/lib/utils/apiResponse";
import { assertValidObjectId } from "@/lib/utils/validation";
import Conversation from "@/models/Conversation";
import {
  controlRoomLightsTool,
  executeDeviceCommandTool,
  getDeviceStatusTool,
  listHomeDevicesTool,
} from "@/services/ai/deviceTools";
import {
  getAuthorizedHomeContext,
  verifyHomeMembership,
} from "@/services/ai/homeContextService";
import { runProviderToolStep } from "@/services/ai/llmProvider";
import { listHomeRoomsTool } from "@/services/ai/roomTools";
import { executeSmartSceneTool } from "@/services/ai/sceneTools";

const MAX_MESSAGE_CHARS = 1500;
const MAX_TITLE_CHARS = 80;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_STORED_MESSAGES = 100;
const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_CALLS_PER_TURN = 6;

const TOOL_SCHEMAS = Object.freeze([
  {
    name: "list_home_rooms",
    description: "List all rooms configured in the user's active home.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_home_devices",
    description:
      "List devices in the active home along with desiredState, reportedState, connectionStatus (online/offline/unknown), and room assignments. Use for queries like which devices are online/offline or devices in a room.",
    parameters: {
      type: "object",
      properties: {
        roomName: {
          type: "string",
          description: "Optional room name filter (e.g. Bedroom, Living Room).",
        },
        type: {
          type: "string",
          enum: ["light", "fan", "led", "other"],
          description: "Optional device type filter.",
        },
        connectionStatus: {
          type: "string",
          enum: ["online", "offline", "unknown"],
          description: "Optional connectivity filter.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_device_status",
    description:
      "Get the detailed desiredState, reportedState, connectionStatus, and pending ACK status of a single device.",
    parameters: {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "Optional MongoDB device ID if known from context.",
        },
        deviceName: {
          type: "string",
          description: "Device name (e.g. Main Light, Fan, Mandir Light).",
        },
        roomName: {
          type: "string",
          description: "Optional room name to disambiguate.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "execute_device_command",
    description:
      "Turn ON or OFF a single specific device through the authenticated ESP32 command queue. Never guess when multiple devices match — if status returns clarification, ask the user.",
    parameters: {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "Optional exact MongoDB device ID from home context.",
        },
        deviceName: {
          type: "string",
          description: "Target device name (e.g. Main Light, Fan, Mandir Light).",
        },
        roomName: {
          type: "string",
          description: "Optional room name to disambiguate.",
        },
        action: {
          type: "string",
          enum: ["on", "off"],
          description: "Required relay power action: on or off.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "control_room_lights",
    description:
      'Turn ON or OFF all devices of type "light" inside a specific room (e.g., "Bedroom ki saari lights on kar do").',
    parameters: {
      type: "object",
      properties: {
        roomId: {
          type: "string",
          description: "Optional room MongoDB ID.",
        },
        roomName: {
          type: "string",
          description: "Name of the room whose lights should be controlled.",
        },
        action: {
          type: "string",
          enum: ["on", "off"],
          description: "Power action for the room lights: on or off.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "execute_smart_scene",
    description:
      "Execute one of the predefined smart home scenes via the authenticated command queue.",
    parameters: {
      type: "object",
      properties: {
        sceneId: {
          type: "string",
          enum: VALID_SCENE_IDS,
          description:
            "Scene ID: good_morning, good_night, away_mode, all_lights_on, or all_lights_off.",
        },
      },
      required: ["sceneId"],
      additionalProperties: false,
    },
  },
]);

export const AGENT_TOOL_REGISTRY = Object.freeze({
  list_home_rooms: {
    name: "list_home_rooms",
    description: TOOL_SCHEMAS[0].description,
    execute: listHomeRoomsTool,
  },
  list_home_devices: {
    name: "list_home_devices",
    description: TOOL_SCHEMAS[1].description,
    execute: listHomeDevicesTool,
  },
  get_device_status: {
    name: "get_device_status",
    description: TOOL_SCHEMAS[2].description,
    execute: getDeviceStatusTool,
  },
  execute_device_command: {
    name: "execute_device_command",
    description: TOOL_SCHEMAS[3].description,
    execute: executeDeviceCommandTool,
  },
  control_room_lights: {
    name: "control_room_lights",
    description: TOOL_SCHEMAS[4].description,
    execute: controlRoomLightsTool,
  },
  execute_smart_scene: {
    name: "execute_smart_scene",
    description: TOOL_SCHEMAS[5].description,
    execute: executeSmartSceneTool,
  },
});

function sanitizeOptionalShortStr(value, fieldName, maxLen = 100) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ServiceError(`Tool argument "${fieldName}" must be a string`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new ServiceError(
      `Tool argument "${fieldName}" cannot exceed ${maxLen} characters`,
      400
    );
  }
  return trimmed || undefined;
}

function buildSystemPrompt(homeContext) {
  const roomsText =
    homeContext.rooms.length > 0
      ? homeContext.rooms
          .map((r) => `- ${r.name} (id=${r.id}${r.floor ? `, floor=${r.floor}` : ""})`)
          .join("\n")
      : "- No rooms registered";

  const devicesText =
    homeContext.devices.length > 0
      ? homeContext.devices
          .map(
            (d) =>
              `- ${d.name} [id=${d.id}, type=${d.type}, room=${d.roomName || "Unassigned"}, desired=${d.desiredState}, reported=${d.reportedState}, conn=${d.connectionStatus}, esp=${d.esp32DeviceId || "unmapped"}, relay=${d.relayNumber ?? "none"}]`
          )
          .join("\n")
      : "- No devices registered";

  const controllersText =
    homeContext.controllers.length > 0
      ? homeContext.controllers
          .map(
            (c) =>
              `- ${c.esp32DeviceId} (${c.name}, status=${c.status}, lastSeen=${c.lastSeen || "never"})`
          )
          .join("\n")
      : "- No controllers provisioned";

  const scenesText = SMART_SCENES.map(
    (s) => `- ${s.id} ("${s.name}"): ${s.description}`
  ).join("\n");

  return [
    `You are JARVIS, smart home assistant for "${homeContext.home.homeName}" (role: ${homeContext.home.role}).`,
    `Understand English, Hindi, and Hinglish naturally (e.g., "on kar do", "band karo", "saari lights", "kaun se devices online hain").`,
    "",
    "RESPONSE LENGTH & VOICE CLARITY RULES (CRITICAL):",
    "1. Keep EVERY answer ultra-short: 1 to 2 simple sentences max (under 25 words for normal actions). Your reply is read aloud by speech synthesis!",
    "2. Speak in plain natural words ONLY: no markdown (`*`, `#`, bullets), no raw command IDs (`cmd_...`), no MongoDB IDs, and no snake_case field names like desiredState or reportedState.",
    "3. Match the user's tone concisely: e.g., 'Main light ON kar diya hai. Hardware confirmation pending.' or 'Good night scene active, all 4 devices OFF queued.'",
    "4. For device status queries, summarize clearly in one short sentence (e.g., 'Abhi 4 devices online hain: Main Light ON, Fan OFF, Mandir Light OFF, Phone Charger OFF.').",
    "",
    "STRICT SAFETY & EXECUTION RULES:",
    "1. Execute device actions and scenes ONLY through the provided tools. Never claim an action happened unless the tool returned executed=true/status=queued/partial.",
    "2. Commands enter the ESP32 queue first (`desiredState` changes while physical state updates only after ESP32 hardware ACK). Briefly say queued / awaiting hardware confirmation unless reported state already matches.",
    "3. If a device or room name is ambiguous (e.g., user says 'light on kar do' when multiple lights exist), ask one short clarifying question listing only the names.",
    "4. If a tool fails (revoked controller, unmapped device, partial failure), state the short reason honestly.",
    "5. Never ask for or reveal API keys, cookies, or controller tokens.",
    "",
    "HOME STATE:",
    `Rooms:\n${roomsText}`,
    `Devices:\n${devicesText}`,
    `Controllers:\n${controllersText}`,
    `Scenes:\n${scenesText}`,
  ].join("\n\n");
}

function summarizeToolResult(toolName, rawResult) {
  const status = rawResult?.status || (rawResult?.executed ? "queued" : "completed");
  const commandIds = [];
  if (rawResult?.commandId) {
    commandIds.push(rawResult.commandId);
  }
  if (Array.isArray(rawResult?.results)) {
    for (const r of rawResult.results) {
      if (r?.commandId) commandIds.push(r.commandId);
    }
  }

  let summary = "";
  if (toolName === "execute_device_command") {
    summary = rawResult?.executed
      ? `${rawResult.deviceName} -> ${String(rawResult.desiredState || "").toUpperCase()} queued`
      : rawResult?.error || rawResult?.message || "Command not executed";
  } else if (toolName === "execute_smart_scene") {
    summary = rawResult?.executed
      ? `${rawResult.sceneName}: ${rawResult.queuedCount} queued${rawResult.failedCount ? `, ${rawResult.failedCount} failed` : ""}`
      : rawResult?.error || "Scene failed";
  } else if (toolName === "control_room_lights") {
    summary = rawResult?.executed
      ? `${rawResult.roomName}: ${rawResult.queuedCount} light(s) queued`
      : rawResult?.message || "Room lights not executed";
  } else if (toolName === "list_home_devices") {
    summary = `Listed ${rawResult?.counts?.total ?? 0} device(s) (${rawResult?.counts?.online ?? 0} online)`;
  } else if (toolName === "list_home_rooms") {
    summary = `Listed ${(rawResult?.rooms || []).length} room(s)`;
  } else if (toolName === "get_device_status") {
    summary = rawResult?.device
      ? `${rawResult.device.name}: desired=${rawResult.device.desiredState}, reported=${rawResult.device.reportedState} (${rawResult.device.connectionStatus})`
      : rawResult?.message || "Status checked";
  }

  // Strip heavy nested device arrays before passing JSON back to LLM & persistence
  const forModel = { ...rawResult };
  delete forModel.devices;
  if (forModel.device && forModel.commandId) {
    delete forModel.device;
  }

  return {
    record: {
      toolName,
      status: [
        "queued",
        "partial",
        "completed",
        "clarification",
        "not_found",
        "failed",
      ].includes(status)
        ? status
        : "completed",
      summary: summary.slice(0, 500),
      commandIds: commandIds.slice(0, 20),
    },
    forModel,
    updatedDevices: Array.isArray(rawResult?.devices)
      ? rawResult.devices
      : rawResult?.device && rawResult?.executed
        ? [rawResult.device]
        : [],
  };
}

/**
 * Validates model-generated tool arguments strictly on the server before invoking
 * authorized tool handlers scoped to verified (homeId, userId).
 */
export async function executeValidatedToolCall(
  toolName,
  rawArgs,
  { homeId, userId }
) {
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return {
      executed: false,
      status: "failed",
      error: "Tool arguments must be a JSON object",
    };
  }

  if (toolName === "list_home_rooms") {
    return listHomeRoomsTool({ homeId, userId });
  }

  if (toolName === "list_home_devices") {
    return listHomeDevicesTool({
      homeId,
      userId,
      roomName: sanitizeOptionalShortStr(rawArgs.roomName, "roomName"),
      type: sanitizeOptionalShortStr(rawArgs.type, "type", 20),
      connectionStatus: sanitizeOptionalShortStr(
        rawArgs.connectionStatus,
        "connectionStatus",
        20
      ),
    });
  }

  if (toolName === "get_device_status") {
    return getDeviceStatusTool({
      homeId,
      userId,
      deviceId: sanitizeOptionalShortStr(rawArgs.deviceId, "deviceId", 40),
      deviceName: sanitizeOptionalShortStr(rawArgs.deviceName, "deviceName"),
      roomName: sanitizeOptionalShortStr(rawArgs.roomName, "roomName"),
    });
  }

  if (toolName === "execute_device_command") {
    const action = sanitizeOptionalShortStr(rawArgs.action, "action", 10);
    return executeDeviceCommandTool({
      homeId,
      userId,
      deviceId: sanitizeOptionalShortStr(rawArgs.deviceId, "deviceId", 40),
      deviceName: sanitizeOptionalShortStr(rawArgs.deviceName, "deviceName"),
      roomName: sanitizeOptionalShortStr(rawArgs.roomName, "roomName"),
      action,
      idempotencyKey: sanitizeOptionalShortStr(
        rawArgs.idempotencyKey,
        "idempotencyKey",
        80
      ),
    });
  }

  if (toolName === "control_room_lights") {
    const action = sanitizeOptionalShortStr(rawArgs.action, "action", 10);
    return controlRoomLightsTool({
      homeId,
      userId,
      roomId: sanitizeOptionalShortStr(rawArgs.roomId, "roomId", 40),
      roomName: sanitizeOptionalShortStr(rawArgs.roomName, "roomName"),
      action,
    });
  }

  if (toolName === "execute_smart_scene") {
    const sceneId = sanitizeOptionalShortStr(rawArgs.sceneId, "sceneId", 60);
    return executeSmartSceneTool({
      homeId,
      userId,
      sceneId,
      idempotencyKey: sanitizeOptionalShortStr(
        rawArgs.idempotencyKey,
        "idempotencyKey",
        80
      ),
    });
  }

  return {
    executed: false,
    status: "failed",
    error: `Unknown or unauthorized tool "${String(toolName)}"`,
  };
}

export async function retrieveHomeRagContext({
  homeId,
  userId,
  query = "",
} = {}) {
  const context = await getAuthorizedHomeContext({ homeId, userId });
  const terms = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return {
      ...context,
      matchedDevices: context.devices,
      matchedRooms: context.rooms,
    };
  }

  const matches = (text) => {
    const hay = String(text || "").toLowerCase();
    return terms.some((t) => hay.includes(t));
  };

  return {
    ...context,
    matchedRooms: context.rooms.filter(
      (r) => matches(r.name) || matches(r.description) || matches(r.floor)
    ),
    matchedDevices: context.devices.filter(
      (d) => matches(d.name) || matches(d.type) || matches(d.roomName)
    ),
  };
}

function serializeConversationSummary(conv) {
  return {
    _id: String(conv._id),
    homeId: String(conv.homeId),
    title: conv.title,
    messageCount: conv.messageCount ?? (conv.messages?.length || 0),
    lastMessageAt: conv.lastMessageAt,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

function serializeConversationDetail(conv) {
  return {
    ...serializeConversationSummary(conv),
    messages: Array.isArray(conv.messages)
      ? conv.messages.map((m) => ({
          role: m.role,
          content: m.content,
          inputMode: m.inputMode || "text",
          toolExecutions: Array.isArray(m.toolExecutions) ? m.toolExecutions : [],
          createdAt: m.createdAt,
        }))
      : [],
  };
}

export async function listConversations({ homeId, userId, limit = 40 } = {}) {
  await verifyHomeMembership({ homeId, userId });
  await connectDB();

  const docs = await Conversation.find({ userId, homeId, source: { $ne: "esp32-voice" } })
    .select("_id homeId title messageCount lastMessageAt createdAt updatedAt")
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .lean();

  return docs.map(serializeConversationSummary);
}

export async function createConversation({
  homeId,
  userId,
  title = "New Conversation",
  now = new Date(),
} = {}) {
  await verifyHomeMembership({ homeId, userId });
  await connectDB();

  const cleanTitle =
    typeof title === "string" && title.trim()
      ? title.trim().slice(0, MAX_TITLE_CHARS)
      : "New Conversation";

  const created = await Conversation.create({
    userId,
    homeId,
    title: cleanTitle,
    messages: [],
    messageCount: 0,
    lastMessageAt: now,
  });

  return serializeConversationDetail(created.toObject());
}

export async function getConversationById(
  conversationId,
  { homeId, userId } = {}
) {
  assertValidObjectId(conversationId, "conversation ID");
  await verifyHomeMembership({ homeId, userId });
  await connectDB();

  const conv = await Conversation.findOne({ _id: conversationId, source: { $ne: "esp32-voice" } }).lean();
  if (!conv) {
    throw new ServiceError("Conversation not found", 404);
  }
  if (
    String(conv.userId) !== String(userId) ||
    String(conv.homeId) !== String(homeId)
  ) {
    throw new ServiceError(
      "You do not have permission to access this conversation",
      403
    );
  }

  return serializeConversationDetail(conv);
}

export async function deleteConversationById(
  conversationId,
  { homeId, userId } = {}
) {
  assertValidObjectId(conversationId, "conversation ID");
  await verifyHomeMembership({ homeId, userId });
  await connectDB();

  const conv = await Conversation.findOne({ _id: conversationId, source: { $ne: "esp32-voice" } })
    .select("_id userId homeId title")
    .lean();
  if (!conv) {
    throw new ServiceError("Conversation not found", 404);
  }
  if (
    String(conv.userId) !== String(userId) ||
    String(conv.homeId) !== String(homeId)
  ) {
    throw new ServiceError(
      "You do not have permission to delete this conversation",
      403
    );
  }

  await Conversation.deleteOne({ _id: conv._id, userId, homeId });
  return { _id: String(conv._id), deleted: true };
}

export async function getConversationHistory({
  homeId,
  userId,
  conversationId = null,
} = {}) {
  if (!conversationId) {
    const list = await listConversations({ homeId, userId });
    return {
      homeId: String(homeId),
      conversationId: null,
      conversations: list,
      messages: [],
      persistenceReady: true,
    };
  }
  const detail = await getConversationById(conversationId, { homeId, userId });
  return {
    homeId: String(homeId),
    conversationId: detail._id,
    messages: detail.messages,
    persistenceReady: true,
  };
}

function buildConversationTitle(messageText) {
  const clean = String(messageText || "").trim().replace(/\s+/g, " ");
  if (clean.length <= 56) return clean || "JARVIS Chat";
  return `${clean.slice(0, 53)}...`;
}

/**
 * Executes one JARVIS assistant turn: verifies Home authorization, builds live
 * MongoDB context, runs bounded LLM + server-side tool execution loops,
 * and persists conversation messages isolated per (userId, homeId).
 */
export async function runAssistantTurn({
  homeId,
  userId,
  conversationId = null,
  message,
  inputMode = "text",
  now = new Date(),
  llmCaller = runProviderToolStep,
} = {}) {
  await verifyHomeMembership({
    homeId,
    userId,
    allowedRoles: ["owner", "admin", "member"],
  });

  if (typeof message !== "string" || !message.trim()) {
    throw new ServiceError("Assistant message cannot be empty", 400);
  }
  const cleanMessage = message.trim();
  if (cleanMessage.length > MAX_MESSAGE_CHARS) {
    throw new ServiceError(
      `Assistant message cannot exceed ${MAX_MESSAGE_CHARS} characters`,
      400
    );
  }

  const cleanInputMode = inputMode === "voice" ? "voice" : "text";

  let existingConversation = null;
  if (conversationId !== null && conversationId !== undefined && conversationId !== "") {
    existingConversation = await getConversationById(conversationId, {
      homeId,
      userId,
    });
  }

  const homeContext = await getAuthorizedHomeContext({ homeId, userId });
  const systemPrompt = buildSystemPrompt(homeContext);

  const priorMessages = (existingConversation?.messages || [])
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  const turnMessages = [
    ...priorMessages,
    { role: "user", content: cleanMessage },
  ];

  const executedToolRecords = [];
  const updatedDeviceMap = new Map();
  const seenToolCallKeys = new Map();
  let totalToolCalls = 0;

  let stepResult = await llmCaller({
    systemPrompt,
    messages: turnMessages,
    toolSchemas: TOOL_SCHEMAS,
  });

  for (
    let round = 0;
    round < MAX_TOOL_ROUNDS &&
    Array.isArray(stepResult?.toolCalls) &&
    stepResult.toolCalls.length > 0;
    round++
  ) {
    const toolResultsForLlm = [];

    for (const tc of stepResult.toolCalls) {
      totalToolCalls += 1;
      if (totalToolCalls > MAX_TOOL_CALLS_PER_TURN) {
        toolResultsForLlm.push({
          id: tc.id,
          name: tc.name,
          result: {
            executed: false,
            status: "failed",
            error: "Per-request tool execution limit reached.",
          },
        });
        continue;
      }

      const callKey = `${tc.name}:${JSON.stringify(tc.args || {})}`;
      let rawOutcome;
      if (seenToolCallKeys.has(callKey)) {
        rawOutcome = {
          ...seenToolCallKeys.get(callKey),
          deduplicated: true,
        };
      } else {
        try {
          rawOutcome = await executeValidatedToolCall(tc.name, tc.args, {
            homeId,
            userId,
          });
        } catch (toolErr) {
          rawOutcome = {
            executed: false,
            status: "failed",
            error: toolErr?.message || "Tool execution failed",
          };
        }
        seenToolCallKeys.set(callKey, rawOutcome);
      }

      const { record, forModel, updatedDevices } = summarizeToolResult(
        tc.name,
        rawOutcome
      );
      executedToolRecords.push(record);
      for (const dev of updatedDevices) {
        if (dev?._id) updatedDeviceMap.set(String(dev._id), dev);
      }

      toolResultsForLlm.push({
        id: tc.id,
        name: tc.name,
        result: forModel,
      });
    }

    stepResult = await llmCaller({
      systemPrompt,
      messages: turnMessages,
      toolSchemas: TOOL_SCHEMAS,
      continuationState: stepResult.continuationState,
      toolResults: toolResultsForLlm,
    });
  }

  let replyText = String(stepResult?.text || "").trim();
  if (!replyText) {
    if (executedToolRecords.length > 0) {
      replyText = executedToolRecords
        .map((r) => r.summary)
        .filter(Boolean)
        .join(" · ");
    }
    if (!replyText) {
      throw new ServiceError(
        "AI provider completed without returning a response message.",
        502
      );
    }
  }

  const userMsgDoc = {
    role: "user",
    content: cleanMessage,
    inputMode: cleanInputMode,
    toolExecutions: [],
    createdAt: now,
  };
  const assistantMsgDoc = {
    role: "assistant",
    content: replyText.slice(0, 8000),
    inputMode: "text",
    toolExecutions: executedToolRecords,
    createdAt: new Date(now.getTime() + 1),
  };

  await connectDB();
  let savedConv;
  if (existingConversation) {
    const isDefaultTitle =
      existingConversation.title === "New Conversation" &&
      (existingConversation.messages?.length || 0) === 0;

    savedConv = await Conversation.findOneAndUpdate(
      { _id: existingConversation._id, userId, homeId },
      {
        $set: {
          lastMessageAt: assistantMsgDoc.createdAt,
          ...(isDefaultTitle ? { title: buildConversationTitle(cleanMessage) } : {}),
        },
        $inc: { messageCount: 2 },
        $push: {
          messages: {
            $each: [userMsgDoc, assistantMsgDoc],
            $slice: -MAX_STORED_MESSAGES,
          },
        },
      },
      { returnDocument: "after" }
    ).lean();
  } else {
    const created = await Conversation.create({
      userId,
      homeId,
      title: buildConversationTitle(cleanMessage),
      messages: [userMsgDoc, assistantMsgDoc],
      messageCount: 2,
      lastMessageAt: assistantMsgDoc.createdAt,
    });
    savedConv = created.toObject();
  }

  return {
    conversation: serializeConversationDetail(savedConv),
    reply: assistantMsgDoc.content,
    toolExecutions: executedToolRecords,
    updatedDevices: Array.from(updatedDeviceMap.values()),
    provider: {
      name: stepResult?.provider || null,
      model: stepResult?.model || null,
    },
  };
}
