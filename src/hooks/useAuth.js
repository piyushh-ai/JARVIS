"use client";

import { useCallback, useState } from "react";
import {
  createUserHome,
  getCurrentSession,
  logoutAccount,
  switchUserHome,
} from "@/services/authApi";

/**
 * Manages authenticated user session, active Home, and Home switching state.
 */
export function useAuth({ initialAuth = null } = {}) {
  const [user, setUser] = useState(initialAuth?.user || null);
  const [homes, setHomes] = useState(initialAuth?.homes || []);
  const [currentHome, setCurrentHome] = useState(initialAuth?.currentHome || null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState(null);

  const applyAuthData = useCallback((data) => {
    setUser(data?.user || null);
    setHomes(Array.isArray(data?.homes) ? data.homes : []);
    setCurrentHome(data?.currentHome || null);
  }, []);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCurrentSession();
      applyAuthData(data);
      return data;
    } catch (err) {
      if (err?.status === 401) {
        applyAuthData(null);
      }
      setError(err?.message || "Failed to verify session");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applyAuthData]);

  const switchHome = useCallback(async (homeId) => {
    setMutating(true);
    setError(null);
    try {
      const data = await switchUserHome(homeId);
      setHomes(Array.isArray(data?.homes) ? data.homes : []);
      setCurrentHome(data?.currentHome || null);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              currentHomeId: data?.currentHome?._id || null,
            }
          : prev
      );
      return data;
    } catch (err) {
      setError(err?.message || "Unable to switch home");
      throw err;
    } finally {
      setMutating(false);
    }
  }, []);

  const createHome = useCallback(async (name) => {
    setMutating(true);
    setError(null);
    try {
      const data = await createUserHome({ name });
      setHomes(Array.isArray(data?.homes) ? data.homes : []);
      setCurrentHome(data?.currentHome || null);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              currentHomeId: data?.currentHome?._id || null,
            }
          : prev
      );
      return data;
    } catch (err) {
      setError(err?.message || "Unable to create home");
      throw err;
    } finally {
      setMutating(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setMutating(true);
    setError(null);
    try {
      await logoutAccount();
      applyAuthData(null);
    } catch (err) {
      setError(err?.message || "Logout failed");
      throw err;
    } finally {
      setMutating(false);
    }
  }, [applyAuthData]);

  return {
    user,
    homes,
    currentHome,
    loading,
    mutating,
    error,
    refreshAuth,
    switchHome,
    createHome,
    logout,
  };
}

export default useAuth;

