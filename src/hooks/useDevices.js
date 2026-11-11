"use client";

import { useCallback } from "react";
import {
  createDevice as createDeviceApi,
  deleteDevice as deleteDeviceApi,
  getDeviceById,
  getDevices,
  toggleDevice as toggleDeviceApi,
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
export function useDevices({ homeId, roomId, type, autoFetch = true } = {}) {
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
    replaceItem,
    setMutationError,
  } = useCollectionResource({
    api: DEVICE_RESOURCE_API,
    filters: { homeId, roomId, type },
    autoFetch,
  });

  const toggleDevice = useCallback(
    async (id, payload = {}) => {
      setMutationError(null);
      try {
        const result = await toggleDeviceApi(id, payload);
        if (result?.device) {
          replaceItem(result.device);
        }
        return result;
      } catch (err) {
        setMutationError(err?.message || "Failed to toggle device");
        throw err;
      }
    },
    [replaceItem, setMutationError]
  );

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
    toggleDevice,
    deleteDevice: deleteItem,
  };
}

export default useDevices;
