import apiClient, { cleanParams } from "@/lib/api/client";

export async function listAssistantConversations(homeId, config = {}) {
  const params = cleanParams({ homeId });
  const response = await apiClient.get("/assistant/conversations", {
    ...config,
    params,
  });
  return response?.data ?? { conversations: [], provider: null };
}

export async function createAssistantConversation(payload = {}, config = {}) {
  const response = await apiClient.post(
    "/assistant/conversations",
    payload,
    config
  );
  return response?.data ?? null;
}

export async function getAssistantConversation(id, homeId, config = {}) {
  const params = cleanParams({ homeId });
  const response = await apiClient.get(
    `/assistant/conversations/${encodeURIComponent(id)}`,
    {
      ...config,
      params,
    }
  );
  return response?.data ?? null;
}

export async function deleteAssistantConversation(id, homeId, config = {}) {
  const params = cleanParams({ homeId });
  const response = await apiClient.delete(
    `/assistant/conversations/${encodeURIComponent(id)}`,
    {
      ...config,
      params,
    }
  );
  return response?.data ?? null;
}

export async function sendAssistantMessage(payload, config = {}) {
  const response = await apiClient.post("/assistant/chat", payload, {
    timeout: 30000,
    ...config,
  });
  return response?.data ?? null;
}

