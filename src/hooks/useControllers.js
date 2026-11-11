"use client";

import { useCallback, useState } from "react";
import {
  getControllers,
  provisionController as provisionControllerApi,
  revokeController as revokeControllerApi,
  rotateControllerToken as rotateControllerApi,
} from "@/services/controllerApi";
import { useCollectionResource } from "@/hooks/useCollectionResource";

const CONTROLLER_RESOURCE_API = {
  list: getControllers,
};

/**
 * Reusable hook for fetching Home-scoped ESP32 controller metadata and running
 * owner/admin provisioning, rotation, and revocation operations.
 * Never persists raw tokens in browser storage or long-lived state.
 */
export function useControllers({ homeId, autoFetch = true } = {}) {
  const [provisioning, setProvisioning] = useState(false);

  const {
    items,
    loading,
    error,
    mutationError,
    lastFetchedAt,
    refresh,
    fetchItems,
    prependItem,
    replaceItem,
    setMutationError,
  } = useCollectionResource({
    api: CONTROLLER_RESOURCE_API,
    filters: { homeId },
    autoFetch,
  });

  const provisionController = useCallback(
    async (payload) => {
      setProvisioning(true);
      setMutationError(null);
      try {
        const result = await provisionControllerApi({
          ...payload,
          ...(homeId ? { homeId } : {}),
        });
        if (result?.controller) {
          prependItem(result.controller);
        }
        return result;
      } catch (err) {
        setMutationError(err?.message || "Failed to provision controller");
        throw err;
      } finally {
        setProvisioning(false);
      }
    },
    [homeId, prependItem, setMutationError]
  );

  const rotateController = useCallback(
    async (idOrEspId, payload = {}) => {
      setProvisioning(true);
      setMutationError(null);
      try {
        const result = await rotateControllerApi(idOrEspId, {
          ...payload,
          ...(homeId ? { homeId } : {}),
        });
        if (result?.controller) {
          replaceItem(result.controller);
        }
        return result;
      } catch (err) {
        setMutationError(err?.message || "Failed to rotate controller token");
        throw err;
      } finally {
        setProvisioning(false);
      }
    },
    [homeId, replaceItem, setMutationError]
  );

  const revokeController = useCallback(
    async (idOrEspId) => {
      setProvisioning(true);
      setMutationError(null);
      try {
        const result = await revokeControllerApi(idOrEspId, {
          ...(homeId ? { homeId } : {}),
        });
        if (result?.controller) {
          replaceItem(result.controller);
        }
        return result;
      } catch (err) {
        setMutationError(err?.message || "Failed to revoke controller");
        throw err;
      } finally {
        setProvisioning(false);
      }
    },
    [homeId, replaceItem, setMutationError]
  );

  return {
    controllers: items,
    loading,
    mutating: provisioning,
    error,
    mutationError,
    lastFetchedAt,
    refresh,
    fetchControllers: fetchItems,
    provisionController,
    rotateController,
    revokeController,
  };
}

export default useControllers;

