import { ServiceError } from "@/lib/utils/apiResponse";
import {
  executeDeviceCommandTool,
  listHomeDevicesTool,
} from "@/services/ai/deviceTools";
import {
  getAuthorizedHomeContext,
  verifyHomeMembership,
} from "@/services/ai/homeContextService";
import { listHomeRoomsTool } from "@/services/ai/roomTools";

/**
 * Tool descriptor registry designed for future LangChain / LangGraph integration.
 * Every executor enforces Home membership and delegates state transitions to core services.
 */
export const AGENT_TOOL_REGISTRY = Object.freeze({
  list_home_rooms: {
    name: "list_home_rooms",
    description: "List all rooms configured in the user's authorized home.",
    execute: listHomeRoomsTool,
  },
  list_home_devices: {
    name: "list_home_devices",
    description:
      "List devices in the authorized home with desiredState, reportedState, and connectionStatus.",
    execute: listHomeDevicesTool,
  },
  execute_device_command: {
    name: "execute_device_command",
    description:
      "Queue an ON/OFF command for an ESP32-mapped device through the central command queue.",
    execute: executeDeviceCommandTool,
  },
});

/**
 * Permission-scoped RAG retrieval seam returning structured home state plus optional
 * keyword-matched entities before prompt assembly.
 */
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
    return { ...context, matchedDevices: context.devices, matchedRooms: context.rooms };
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

export async function getConversationHistory({
  homeId,
  userId,
  conversationId = null,
} = {}) {
  await verifyHomeMembership({ homeId, userId });
  return {
    homeId: String(homeId),
    conversationId,
    messages: [],
    persistenceReady: false,
  };
}

/**
 * Execution entrypoint for the future LangGraph assistant workflow.
 * Fails explicitly until a real LLM provider credential and graph runner are configured.
 */
export async function runAssistantTurn({
  homeId,
  userId,
  message,
} = {}) {
  await verifyHomeMembership({ homeId, userId });

  if (typeof message !== "string" || !message.trim()) {
    throw new ServiceError("Assistant prompt message is required", 400);
  }

  throw new ServiceError(
    "AI Assistant LLM provider is not configured yet. Architectural seams and tool bindings are ready for LangGraph integration.",
    501
  );
}

