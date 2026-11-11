"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanParams } from "@/lib/api/client";

/**
 * Shared React hook helper managing collection fetch, AbortController cancellation,
 * stale-response protection, loading/error state, and synced CRUD mutations.
 */
export function useCollectionResource({
  api,
  filters = {},
  autoFetch = true,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(autoFetch));
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const mountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const filterKey = JSON.stringify(cleanParams(filters));

  const invalidatePendingFetches = useCallback(() => {
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      requestIdRef.current += 1;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchItems = useCallback(
    async (overrideFilters) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentRequestId = ++requestIdRef.current;
      const activeFilters =
        overrideFilters !== undefined
          ? cleanParams(overrideFilters)
          : JSON.parse(filterKey);

      setLoading(true);
      setError(null);

      try {
        const list = await api.list(activeFilters, {
          signal: controller.signal,
        });
        if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
          return [];
        }
        const normalized = Array.isArray(list) ? list : [];
        setItems(normalized);
        setLastFetchedAt(Date.now());
        return normalized;
      } catch (err) {
        if (
          err?.isCanceled ||
          !mountedRef.current ||
          currentRequestId !== requestIdRef.current
        ) {
          return [];
        }
        setError(err?.message || "Failed to load data");
        throw err;
      } finally {
        if (
          mountedRef.current &&
          currentRequestId === requestIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [api, filterKey]
  );

  useEffect(() => {
    if (!autoFetch) return undefined;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        fetchItems().catch(() => {
          // Error state is captured inside the hook for UI consumption.
        });
      }
    });

    return () => {
      cancelled = true;
      abortControllerRef.current?.abort();
    };
  }, [autoFetch, fetchItems]);

  const getItem = useCallback(
    async (id) => {
      setError(null);
      try {
        return await api.getById(id);
      } catch (err) {
        if (mountedRef.current && !err?.isCanceled) {
          setError(err?.message || "Failed to fetch item");
        }
        throw err;
      }
    },
    [api]
  );

  const createItem = useCallback(
    async (payload) => {
      invalidatePendingFetches();
      setMutating(true);
      setMutationError(null);
      try {
        const created = await api.create(payload);
        if (mountedRef.current && created) {
          setItems((prev) => [created, ...prev]);
          setLastFetchedAt(Date.now());
        }
        return created;
      } catch (err) {
        if (mountedRef.current) {
          setMutationError(err?.message || "Failed to create item");
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setMutating(false);
        }
      }
    },
    [api, invalidatePendingFetches]
  );

  const updateItem = useCallback(
    async (id, payload) => {
      invalidatePendingFetches();
      setMutating(true);
      setMutationError(null);
      try {
        const updated = await api.update(id, payload);
        if (mountedRef.current && updated) {
          setItems((prev) =>
            prev.map((entry) => (entry._id === id ? updated : entry))
          );
          setLastFetchedAt(Date.now());
        }
        return updated;
      } catch (err) {
        if (mountedRef.current) {
          setMutationError(err?.message || "Failed to update item");
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setMutating(false);
        }
      }
    },
    [api, invalidatePendingFetches]
  );

  const deleteItem = useCallback(
    async (id) => {
      invalidatePendingFetches();
      setMutating(true);
      setMutationError(null);
      try {
        const deleted = await api.remove(id);
        if (mountedRef.current) {
          setItems((prev) => prev.filter((entry) => entry._id !== id));
          setLastFetchedAt(Date.now());
        }
        return deleted;
      } catch (err) {
        if (mountedRef.current) {
          setMutationError(err?.message || "Failed to delete item");
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setMutating(false);
        }
      }
    },
    [api, invalidatePendingFetches]
  );

  return {
    items,
    loading,
    mutating,
    error,
    mutationError,
    lastFetchedAt,
    refresh: fetchItems,
    fetchItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
  };
}
