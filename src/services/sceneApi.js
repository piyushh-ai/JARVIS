import apiClient from "@/lib/api/client";

export async function getScenes(config = {}) {
  const response = await apiClient.get("/scenes", config);
  return response?.data ?? [];
}

export async function executeScene(sceneId, payload = {}, config = {}) {
  const response = await apiClient.post(
    `/scenes/${encodeURIComponent(sceneId)}/execute`,
    payload,
    config
  );
  return {
    message: response?.message || "",
    data: response?.data ?? null,
  };
}

