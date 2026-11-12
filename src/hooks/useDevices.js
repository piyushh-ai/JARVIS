"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const FAST_RECONCILE_MS = 2000;
const SLOW_RECONCILE_MS = 5000;
const FAST_WINDOW_MS = 15000;

/**
 * Reusable hook for fetching and mutating smart room devices via /api/devices.
 * Supports instant optimistic desiredState transitions, per-device serialized
 * rapid toggles with rollback, and adaptive hardware ACK reconciliation polling.
 */
export function useDevices({ homeId, roomId, type, autoFetch = true } = {}) {
  const {
    items,
    setItems,
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
    patchItem,
    setMutationError,
  } = useCollectionResource({
    api: DEVICE_RESOURCE_API,
    filters: { homeId, roomId, type },
    autoFetch,
  });

  const [syncStateByDevice, setSyncStateByDevice] = useState({});
  const mountedRef = useRef(true);
  const itemsRef = useRef(items);
  const serverDesiredRef = useRef(new Map());
  const latestSeqByIdRef = useRef(new Map());
  const inFlightCountByIdRef = useRef(new Map());
  const tailPromiseByIdRef = useRef(new Map());
  const lastToggleAtRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    itemsRef.current = items;
    for (const dev of items) {
      if ((inFlightCountByIdRef.current.get(dev._id) || 0) === 0) {
        serverDesiredRef.current.set(dev._id, dev.desiredState);
      }
    }
  }, [items]);

  const setDeviceSyncState = useCallback((id, next) => {
    if (!mountedRef.current) return;
    setSyncStateByDevice((prev) => {
      if (!next) {
        if (!(id in prev)) return prev;
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const toggleDevice = useCallback(
    async (id, payload = {}) => {
      const current = itemsRef.current.find((entry) => entry._id === id);
      const nextDesired =
        payload.desiredState ?? (current?.desiredState === "on" ? "off" : "on");
      const fallbackDesired =
        serverDesiredRef.current.get(id) ?? current?.desiredState ?? "off";

      const seq = (latestSeqByIdRef.current.get(id) || 0) + 1;
      latestSeqByIdRef.current.set(id, seq);
      inFlightCountByIdRef.current.set(
        id,
        (inFlightCountByIdRef.current.get(id) || 0) + 1
      );
      lastToggleAtRef.current = Date.now();

      // Immediate optimistic UI update for desiredState ONLY (never alters reportedState)
      setMutationError(null);
      patchItem(id, { desiredState: nextDesired });
      setDeviceSyncState(id, {
        status: "queuing",
        desiredState: nextDesired,
        commandId: null,
        error: null,
        updatedAt: Date.now(),
      });

      const prevQueue = tailPromiseByIdRef.current.get(id) || Promise.resolve();
      const requestPayload = { ...payload, desiredState: nextDesired };

      const runQueued = prevQueue
        .catch(() => undefined)
        .then(async () => {
          try {
            const result = await toggleDeviceApi(id, requestPayload);
            if (result?.device) {
              serverDesiredRef.current.set(id, result.device.desiredState);
            }

            if (mountedRef.current && latestSeqByIdRef.current.get(id) === seq) {
              if (result?.device) {
                replaceItem(result.device);
                const synced =
                  result.device.desiredState === result.device.reportedState;
                setDeviceSyncState(id, {
                  status: synced ? "synced" : "pending_ack",
                  desiredState: result.device.desiredState,
                  commandId: result.command?.commandId || null,
                  error: null,
                  updatedAt: Date.now(),
                });
              }
            }
            return result;
          } catch (err) {
            if (mountedRef.current && latestSeqByIdRef.current.get(id) === seq) {
              const message = err?.message || "Failed to toggle device";
              patchItem(id, { desiredState: fallbackDesired });
              setMutationError(message);
              setDeviceSyncState(id, {
                status: "failed",
                desiredState: fallbackDesired,
                commandId: null,
                error: message,
                updatedAt: Date.now(),
              });
            }
            throw err;
          } finally {
            const nextCount = Math.max(
              0,
              (inFlightCountByIdRef.current.get(id) || 1) - 1
            );
            if (nextCount === 0) {
              inFlightCountByIdRef.current.delete(id);
            } else {
              inFlightCountByIdRef.current.set(id, nextCount);
            }
          }
        });

      tailPromiseByIdRef.current.set(id, runQueued);
      return runQueued;
    },
    [patchItem, replaceItem, setDeviceSyncState, setMutationError]
  );

  // Reconcile automatically only for mapped devices that either:
  // 1. Are online and diverged (desiredState !== reportedState), OR
  // 2. Were recently toggled (< 60s) and are awaiting hardware ACK.
  // Untouched "unknown" / offline devices never cause perpetual idle background polling.
  const hasUnreconciledDevices = items.some((dev) => {
    const mapped = Boolean(dev.esp32DeviceId && dev.relayNumber);
    if (!mapped || dev.connectionStatus === "offline") return false;
    const syncEntry = syncStateByDevice[dev._id];
    if (
      syncEntry?.status === "pending_ack" &&
      dev.desiredState !== dev.reportedState
    ) {
      return true;
    }
    return (
      dev.connectionStatus === "online" &&
      dev.desiredState !== dev.reportedState
    );
  });

  useEffect(() => {
    if (!autoFetch || !homeId || !hasUnreconciledDevices) return undefined;

    let cancelled = false;
    let timerId = null;

    const reconcileOnce = async () => {
      if (cancelled) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        timerId = setTimeout(reconcileOnce, SLOW_RECONCILE_MS);
        return;
      }

      try {
        const fresh = await getDevices({ homeId, roomId, type });
        if (cancelled || !mountedRef.current || !Array.isArray(fresh)) return;

        for (const d of fresh) {
          serverDesiredRef.current.set(d._id, d.desiredState);
        }

        // Preserve any active local optimistic desiredState while still merging
        // hardware reportedState, connectionStatus, and lastSeen telemetry.
        setItems((prev) => {
          const prevById = new Map(prev.map((entry) => [entry._id, entry]));
          return fresh.map((serverDoc) => {
            if ((inFlightCountByIdRef.current.get(serverDoc._id) || 0) > 0) {
              const localDoc = prevById.get(serverDoc._id);
              return localDoc
                ? { ...serverDoc, desiredState: localDoc.desiredState }
                : serverDoc;
            }
            return serverDoc;
          });
        });

        const nowMs = Date.now();
        setSyncStateByDevice((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const d of fresh) {
            const entry = prev[d._id];
            if (!entry || entry.status !== "pending_ack") continue;
            if (d.desiredState === d.reportedState) {
              next[d._id] = {
                ...entry,
                status: "synced",
                updatedAt: nowMs,
              };
              changed = true;
            } else if (
              d.connectionStatus !== "online" &&
              nowMs - (entry.updatedAt || 0) >= 60000
            ) {
              // End the 60s optimistic poll window for non-online hardware cleanly
              next[d._id] = {
                ...entry,
                status: "pending_window_elapsed",
                updatedAt: nowMs,
              };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch {
        // Silent background poll ignores transient errors cleanly
      } finally {
        if (!cancelled) {
          const elapsed = Date.now() - lastToggleAtRef.current;
          const nextDelay =
            elapsed < FAST_WINDOW_MS ? FAST_RECONCILE_MS : SLOW_RECONCILE_MS;
          timerId = setTimeout(reconcileOnce, nextDelay);
        }
      }
    };

    const elapsed = Date.now() - lastToggleAtRef.current;
    const initialDelay =
      elapsed < FAST_WINDOW_MS ? FAST_RECONCILE_MS : SLOW_RECONCILE_MS;
    timerId = setTimeout(reconcileOnce, initialDelay);

    const handleVisibilityChange = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        timerId
      ) {
        clearTimeout(timerId);
        reconcileOnce();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [
    autoFetch,
    homeId,
    roomId,
    type,
    hasUnreconciledDevices,
    setItems,
  ]);

  return {
    devices: items,
    loading,
    mutating,
    error,
    mutationError,
    lastFetchedAt,
    syncStateByDevice,
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
