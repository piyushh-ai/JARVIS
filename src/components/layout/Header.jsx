"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Cpu,
  Home,
  LogOut,
  Plus,
  RefreshCw,
  Shield,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";

/**
 * Compact mobile-first HUD header displaying JARVIS branding, backend sync state,
 * active Home switcher, user role badge, and Sign Out control.
 */
export default function Header({
  status = "connected",
  systemLabel = "SMART ROOM OS",
  user = null,
  homes = [],
  currentHome = null,
  onSwitchHome,
  onCreateHome,
  onLogout,
  authMutating = false,
  onRefresh,
  isRefreshing = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [newHomeName, setNewHomeName] = useState("");
  const [homeError, setHomeError] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const isConnected = status === "connected";
  const isSyncing = status === "syncing";

  const statusText = isSyncing
    ? "Syncing"
    : isConnected
      ? "API Ready"
      : "Offline";

  const subtitle = currentHome
    ? `${currentHome.name} · ${currentHome.role.toUpperCase()}`
    : systemLabel;

  const handleHomeSelect = async (homeId) => {
    setHomeError("");
    if (!onSwitchHome || String(homeId) === String(currentHome?._id)) {
      setMenuOpen(false);
      return;
    }
    try {
      await onSwitchHome(homeId);
      setMenuOpen(false);
    } catch (err) {
      setHomeError(err?.message || "Failed to switch home");
    }
  };

  const handleCreateHomeSubmit = async (event) => {
    event.preventDefault();
    const trimmed = newHomeName.trim();
    if (trimmed.length < 2) {
      setHomeError("Home name must be at least 2 characters");
      return;
    }
    setHomeError("");
    try {
      await onCreateHome?.(trimmed);
      setNewHomeName("");
      setMenuOpen(false);
    } catch (err) {
      setHomeError(err?.message || "Failed to create home");
    }
  };

  return (
    <header
      data-gsap="header"
      className="sticky top-0 z-30 hud-surface-elevated border-x-0 border-t-0"
    >
      <div className="hud-container flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div
            className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl hud-border-active glow-cyan-sm"
            style={{
              background:
                "linear-gradient(145deg, rgba(0, 229, 255, 0.14), rgba(22, 119, 255, 0.08))",
            }}
            aria-hidden="true"
          >
            <Cpu className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-primary" />
          </div>

          <div className="min-w-0">
            <h1 className="font-display text-sm sm:text-base font-semibold tracking-[0.18em] sm:tracking-[0.2em] text-foreground glow-cyan-text truncate">
              JARVIS
            </h1>
            <p className="truncate text-[10px] uppercase tracking-[0.11em] sm:tracking-[0.15em] text-muted">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider hud-surface ${
              isConnected
                ? "hud-border-active text-cyan-primary"
                : isSyncing
                  ? "border-blue-secondary/50 text-foreground"
                  : "border-red-400/40 text-red-300"
            }`}
            role="status"
            aria-label={`Backend status: ${statusText}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected
                  ? "bg-cyan-primary shadow-[0_0_6px_rgba(0,229,255,0.85)]"
                  : isSyncing
                    ? "bg-blue-secondary"
                    : "bg-red-400"
              }`}
              aria-hidden="true"
            />
            {isSyncing ? (
              <RefreshCw
                className="h-3 w-3 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : isConnected ? (
              <Wifi className="h-3 w-3 text-cyan-primary" aria-hidden="true" />
            ) : (
              <WifiOff className="h-3 w-3 text-red-300" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{statusText}</span>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh dashboard"
              title="Refresh dashboard data"
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl hud-surface text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isRefreshing ? "animate-spin motion-reduce:animate-none" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          )}

          {user && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Account and homes"
                title={user.name || "Account and homes"}
                className="flex h-9 sm:h-10 items-center gap-1.5 rounded-xl hud-surface px-2.5 sm:px-3 text-xs font-medium text-foreground hover:text-cyan-primary hover:hud-border-active cursor-pointer"
              >
                <User className="h-4 w-4 text-cyan-primary shrink-0" aria-hidden="true" />
                <span className="hidden md:inline max-w-[110px] truncate">
                  {user.name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" aria-hidden="true" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl hud-surface-elevated hud-border-active p-3.5 shadow-2xl glow-cyan-sm z-40"
                >
                  <div className="border-b border-cyan-primary/15 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {user.name}
                      </p>
                      {currentHome && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-primary border border-cyan-primary/25">
                          <Shield className="h-2.5 w-2.5" aria-hidden="true" />
                          {currentHome.role}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {user.email}
                    </p>
                  </div>

                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Authorized Homes ({homes.length})
                    </p>
                    <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
                      {homes.map((home) => {
                        const isActive =
                          String(home._id) === String(currentHome?._id);
                        return (
                          <button
                            key={home._id}
                            type="button"
                            disabled={authMutating}
                            onClick={() => handleHomeSelect(home._id)}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition cursor-pointer disabled:opacity-50 ${
                              isActive
                                ? "hud-border-active bg-cyan-primary/10 text-cyan-primary"
                                : "hud-surface text-foreground hover:border-cyan-primary/30"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate font-medium">
                                {home.name}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
                              {home.role}
                              {isActive && (
                                <Check className="h-3.5 w-3.5 text-cyan-primary" />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {onCreateHome && (
                    <form
                      onSubmit={handleCreateHomeSubmit}
                      className="mt-3 border-t border-cyan-primary/15 pt-3"
                    >
                      <label
                        htmlFor="header-new-home-name"
                        className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                      >
                        Create New Home
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id="header-new-home-name"
                          type="text"
                          value={newHomeName}
                          onChange={(e) => setNewHomeName(e.target.value)}
                          placeholder="e.g. Beach Villa"
                          maxLength={80}
                          disabled={authMutating}
                          className="min-w-0 flex-1 rounded-xl border border-cyan-primary/20 bg-surface-dark/70 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={authMutating}
                          aria-label="Add home"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl hud-border-active bg-cyan-primary/15 text-cyan-primary hover:bg-cyan-primary/25 cursor-pointer disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {homeError && (
                        <p className="mt-1.5 text-[11px] text-red-300" role="alert">
                          {homeError}
                        </p>
                      )}
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              disabled={authMutating}
              aria-label="Log out"
              title="Log out"
              className="flex h-9 w-9 sm:h-10 sm:w-auto sm:px-3 items-center justify-center gap-1.5 rounded-xl hud-surface text-muted hover:text-red-300 hover:border-red-400/40 cursor-pointer disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline text-xs font-medium">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
