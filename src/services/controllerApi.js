import apiClient, { cleanParams } from "@/lib/api/client";

export async function getControllers(filters = {}, config = {}) {
  const params = cleanParams({
    homeId: filters.homeId,
  });
  const response = await apiClient.get("/esp32/controllers", {
    ...config,
    params,
  });
  return response?.data ?? [];
}

export async function provisionController(payload, config = {}) {
  const response = await apiClient.post("/esp32/controllers", payload, config);
  return response?.data ?? null;
}

export async function updateController(idOrEspId, payload = {}, config = {}) {
  const response = await apiClient.patch(
    `/esp32/controllers/${encodeURIComponent(idOrEspId)}`,
    payload,
    config
  );
  return response?.data ?? null;
}

export async function rotateControllerToken(
  idOrEspId,
  payload = {},
  config = {}
) {
  const response = await apiClient.post(
    `/esp32/controllers/${encodeURIComponent(idOrEspId)}/rotate`,
    payload,
    config
  );
  return response?.data ?? null;
}

export async function revokeController(idOrEspId, payload = {}, config = {}) {
  const response = await apiClient.post(
    `/esp32/controllers/${encodeURIComponent(idOrEspId)}/revoke`,
    payload,
    config
  );
  return response?.data ?? null;
}

