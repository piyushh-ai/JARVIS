import apiClient, { cleanParams } from "@/lib/api/client";

export async function getRooms(filters = {}, config = {}) {
  const params = cleanParams({
    homeId: filters.homeId,
  });
  const response = await apiClient.get("/rooms", { ...config, params });
  return response?.data ?? [];
}

export async function getRoomById(id, config = {}) {
  const response = await apiClient.get(
    `/rooms/${encodeURIComponent(id)}`,
    config
  );
  return response?.data ?? null;
}

export async function createRoom(payload, config = {}) {
  const response = await apiClient.post("/rooms", payload, config);
  return response?.data ?? null;
}

export async function updateRoom(id, payload, config = {}) {
  const response = await apiClient.patch(
    `/rooms/${encodeURIComponent(id)}`,
    payload,
    config
  );
  return response?.data ?? null;
}

export async function deleteRoom(id, config = {}) {
  const response = await apiClient.delete(
    `/rooms/${encodeURIComponent(id)}`,
    config
  );
  return response?.data ?? null;
}

