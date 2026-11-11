import apiClient, { cleanParams } from "@/lib/api/client";

export async function getDevices(filters = {}, config = {}) {
  const params = cleanParams({
    roomId: filters.roomId,
    type: filters.type,
  });
  const response = await apiClient.get("/devices", { ...config, params });
  return response?.data ?? [];
}

export async function getDeviceById(id, config = {}) {
  const response = await apiClient.get(
    `/devices/${encodeURIComponent(id)}`,
    config
  );
  return response?.data ?? null;
}

export async function createDevice(payload, config = {}) {
  const response = await apiClient.post("/devices", payload, config);
  return response?.data ?? null;
}

export async function updateDevice(id, payload, config = {}) {
  const response = await apiClient.patch(
    `/devices/${encodeURIComponent(id)}`,
    payload,
    config
  );
  return response?.data ?? null;
}

export async function deleteDevice(id, config = {}) {
  const response = await apiClient.delete(
    `/devices/${encodeURIComponent(id)}`,
    config
  );
  return response?.data ?? null;
}

