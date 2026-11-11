"use client";

import {
  createDevice as createDeviceApi,
  deleteDevice as deleteDeviceApi,
  getDeviceById,
  getDevices,
  updateDevice as updateDeviceApi,
} from "@/services/deviceApi";
import { useCollectionResource } from "@/hooks/useCollectionResource";

const DEVICE_RESOURCE_API = {
  list: getDevices,
  getById: getDeviceById,
  create: createDeviceApi,
  update: updateDeviceApi,
  remove: deleteDeviceApi,
};

/**
 * Reusable hook for fetching and mutating smart room devices via /api/devices.
 */
export function useDevices({ roomId, type, autoFetch = true } = {}) {
  const {
    items,
    loading,
    mutating,
    error,
    mutationError,
    lastFetchedAt,
    refresh,
    fetchItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
  } = useCollectionResource({
    api: DEVICE_RESOURCE_API,
    filters: { roomId, type },
    autoFetch,
  });

  return {
    devices: items,
    loading,
    mutating,
    error,
    mutationError,
    lastFetchedAt,
    refresh,
    fetchDevices: fetchItems,
    getDevice: getItem,
    createDevice: createItem,
    updateDevice: updateItem,
    deleteDevice: deleteItem,
  };
}

export default useDevices;

