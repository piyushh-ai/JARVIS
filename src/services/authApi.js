import apiClient from "@/lib/api/client";

export async function getCurrentSession(config = {}) {
  const response = await apiClient.get("/auth/me", config);
  return response?.data ?? null;
}

export async function registerAccount(payload, config = {}) {
  const response = await apiClient.post("/auth/register", payload, config);
  return response?.data ?? null;
}

export async function loginAccount(payload, config = {}) {
  const response = await apiClient.post("/auth/login", payload, config);
  return response?.data ?? null;
}

export async function logoutAccount(config = {}) {
  const response = await apiClient.post("/auth/logout", {}, config);
  return response?.data ?? null;
}

export async function createUserHome(payload, config = {}) {
  const response = await apiClient.post("/homes", payload, config);
  return response?.data ?? null;
}

export async function switchUserHome(homeId, config = {}) {
  const response = await apiClient.post("/homes/switch", { homeId }, config);
  return response?.data ?? null;
}

export async function getHomeMembersList(homeId, config = {}) {
  const response = await apiClient.get(
    `/homes/${encodeURIComponent(homeId)}/members`,
    config
  );
  return response?.data ?? [];
}

export async function inviteHomeMember(homeId, payload, config = {}) {
  const response = await apiClient.post(
    `/homes/${encodeURIComponent(homeId)}/members`,
    payload,
    config
  );
  return response?.data ?? [];
}

