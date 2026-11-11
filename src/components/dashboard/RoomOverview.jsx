"use client";

import {
  AlertTriangle,
  ChevronRight,
  Cpu,
  Fan,
  Home,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { prefersReducedMotion } from "@/lib/motion";

const EMPTY_SUMMARY = {
  totalRooms: 0,
  totalDevices: 0,
  desiredOnCount: 0,
  typeCounts: { light: 0, fan: 0, led: 0, other: 0 },
  connectionCounts: { online: 0, offline: 0, unknown: 0 },
  reportedCounts: { on: 0, off: 0, unknown: 0 },
  devicesByRoom: new Map(),
};

const TYPE_ITEMS = [
  { key: "light", label: "Light", icon: Lightbulb },
  { key: "fan", label: "Fan", icon: Fan },
  { key: "led", label: "LED", icon: Sparkles },
  { key: "other", label: "Other", icon: Cpu },
];

const CONNECTION_ITEMS = [
  { key: "online", label: "HW Online", valueClass: "text-cyan-primary" },
  { key: "offline", label: "Offline", valueClass: "text-red-300" },
  { key: "unknown", label: "Unknown", valueClass: "text-amber-200" },
];

function scrollToSection(sectionId) {
  if (typeof document === "undefined") return;
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

/**
 * MongoDB-backed Dashboard & Room Overview displaying live inventory totals,
 * separate desired/reported/connection metrics, device types summary, and room drill-down links.
 */
export default function RoomOverview({
  rooms = [],
  summary = EMPTY_SUMMARY,
  selectedRoomId = "",
  roomLabel = "All Rooms",
  syncStatus = "DB Synced",
  loading = false,
  error = null,
  lastSyncedAt = null,
  onRefresh,
  onSelectRoom,
  onClearRoomFilter,
}) {
  const isError = syncStatus === "Error";
  const isSyncing = syncStatus === "Syncing";
  const hasInitialData = rooms.length > 0 || summary.totalDevices > 0;
  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const badgeStyle = isError
    ? "border border-red-400/40 text-red-300 bg-red-500/10"
    : isSyncing
      ? "border border-blue-secondary/50 text-foreground bg-blue-secondary/10"
      : "hud-border-active text-cyan-primary bg-cyan-primary/10";

  const handleRoomClick = (roomId) => {
    onSelectRoom?.(String(roomId));
    scrollToSection("devices-section");
  };

  return (
    <section
      aria-label="Room overview"
      data-gsap="room-overview"
      className="hud-surface rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Top Bar: Identity, Sync Status & Manual Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-primary/10 hud-border-active text-cyan-primary">
            <Home className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-semibold tracking-wider text-foreground truncate">
              {selectedRoomId ? roomLabel : "Dashboard Overview"}
            </h2>
            <p className="text-[11px] text-muted truncate">
              {lastSyncedLabel
                ? `MongoDB Synced · ${lastSyncedLabel}`
                : "MongoDB Atlas Live Inventory"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedRoomId && onClearRoomFilter && (
            <button
              type="button"
              onClick={onClearRoomFilter}
              className="rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wider hud-surface text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer"
            >
              All
            </button>
          )}

          {onRefresh && (
            <button
              type="button"
              disabled={loading}
              onClick={onRefresh}
              aria-label="Refresh dashboard overview"
              title="Refresh dashboard overview"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full hud-surface text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loading ? "animate-spin motion-reduce:animate-none" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          )}

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider ${badgeStyle}`}
          >
            {isError ? (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : isSyncing ? (
              <RefreshCw
                className="h-3 w-3 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {syncStatus}
          </span>
        </div>
      </div>

      {/* Loading / Error / Data States */}
      {loading && !hasInitialData ? (
        <div
          role="status"
          aria-label="Loading dashboard overview"
          className="space-y-3 animate-pulse"
        >
          <div className="h-14 rounded-xl bg-white/5" />
          <div className="h-16 rounded-xl bg-white/5" />
          <div className="h-24 rounded-xl bg-white/5" />
        </div>
      ) : error && !hasInitialData ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-center space-y-2.5"
        >
          <AlertTriangle
            className="mx-auto h-5 w-5 text-red-300"
            aria-hidden="true"
          />
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
              Failed to load dashboard overview
            </p>
            <p className="mt-1 text-[11px] text-red-200/90">{error}</p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-primary/18 hud-border-active px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/28 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200"
            >
              <span className="truncate">{error}</span>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="shrink-0 font-semibold underline text-cyan-primary cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Core Totals: Rooms / Devices / Desired ON */}
          <dl className="grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-background/55 hud-border py-2.5 px-1 text-center">
            <div className="px-2 min-w-0">
              <dt className="text-[10px] uppercase tracking-wider text-muted truncate">
                Total Rooms
              </dt>
              <dd className="mt-0.5 font-display text-sm sm:text-base font-semibold tabular-nums text-foreground">
                {summary.totalRooms}
              </dd>
            </div>

            <div className="px-2 min-w-0">
              <dt className="text-[10px] uppercase tracking-wider text-muted truncate">
                Devices
              </dt>
              <dd className="mt-0.5 font-display text-sm sm:text-base font-semibold tabular-nums text-foreground">
                {summary.totalDevices}
              </dd>
            </div>

            <div className="px-2 min-w-0">
              <dt className="text-[10px] uppercase tracking-wider text-muted truncate">
                Desired ON
              </dt>
              <dd className="mt-0.5 font-display text-sm sm:text-base font-semibold tabular-nums text-cyan-primary">
                {summary.desiredOnCount}
              </dd>
            </div>
          </dl>

          {/* Hardware Connection Status & Separate Reported State */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted">
              <span>Connection Status</span>
              <span>
                {summary.totalDevices === 0
                  ? "No Devices"
                  : summary.connectionCounts.online === summary.totalDevices
                    ? "ESP32 Linked"
                    : summary.connectionCounts.online > 0
                      ? "Partial Telemetry"
                      : "ESP32 Telemetry Pending"}
              </span>
            </div>

            <dl className="grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-background/55 hud-border py-2 px-1 text-center">
              {CONNECTION_ITEMS.map(({ key, label, valueClass }) => (
                <div key={key} className="px-2 min-w-0">
                  <dt className="text-[10px] uppercase tracking-wider text-muted truncate">
                    {label}
                  </dt>
                  <dd
                    className={`mt-0.5 font-display text-sm font-semibold tabular-nums ${
                      summary.connectionCounts[key] > 0
                        ? valueClass
                        : "text-foreground/75"
                    }`}
                  >
                    {summary.connectionCounts[key]}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="rounded-lg bg-background/45 hud-border px-2.5 py-1.5 text-[11px] text-muted flex flex-wrap items-center justify-between gap-1.5">
              <span className="uppercase tracking-wider text-[10px]">
                Reported State
              </span>
              <span className="tabular-nums text-foreground/85">
                ON {summary.reportedCounts.on} · OFF{" "}
                {summary.reportedCounts.off} · Unknown{" "}
                {summary.reportedCounts.unknown}
              </span>
            </p>
          </div>

          {/* Device Types Summary */}
          <div className="space-y-2">
            <span className="block text-[10px] uppercase tracking-wider text-muted">
              Device Types Summary
            </span>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TYPE_ITEMS.map(({ key, label, icon: Icon }) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl bg-background/55 hud-border px-2.5 py-2 min-w-0"
                >
                  <dt className="inline-flex items-center gap-1.5 text-[11px] text-muted min-w-0">
                    <Icon
                      className="h-3.5 w-3.5 shrink-0 text-cyan-primary/85"
                      aria-hidden="true"
                    />
                    <span className="truncate">{label}</span>
                  </dt>
                  <dd className="font-display text-xs font-semibold tabular-nums text-foreground">
                    {summary.typeCounts[key]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Room Overview List with Device Counts & Quick Navigation */}
          <div className="space-y-2 border-t hud-divider pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Rooms Overview
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <a
                  href="#rooms-section"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("rooms-section");
                  }}
                  className="text-cyan-primary/90 hover:text-cyan-primary underline-offset-2 hover:underline"
                >
                  Manage Rooms
                </a>
                <a
                  href="#devices-section"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("devices-section");
                  }}
                  className="text-muted hover:text-cyan-primary underline-offset-2 hover:underline"
                >
                  View Devices
                </a>
              </div>
            </div>

            {rooms.length === 0 ? (
              <div className="rounded-xl bg-background/55 hud-border p-3 text-center space-y-2">
                <p className="text-xs text-muted">No rooms created yet.</p>
                <a
                  href="#rooms-section"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("rooms-section");
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-primary hover:underline"
                >
                  Go to Room Management
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {rooms.map((room) => {
                  const roomDevices =
                    summary.devicesByRoom.get(String(room._id)) || [];
                  const isSelected = selectedRoomId === String(room._id);

                  return (
                    <li key={room._id}>
                      <button
                        type="button"
                        onClick={() => handleRoomClick(room._id)}
                        aria-label={`Open ${room.name} devices (${roomDevices.length} ${roomDevices.length === 1 ? "device" : "devices"})`}
                        className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-cyan-primary/12 hud-border-active"
                            : "bg-background/55 hud-border hover:hud-border-active"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-display text-xs font-medium tracking-wide text-foreground truncate">
                            {room.name}
                          </p>
                          <p className="text-[11px] text-muted truncate">
                            {roomDevices.length === 0
                              ? "0 devices assigned"
                              : roomDevices.map((d) => d.name).join(", ")}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider tabular-nums ${
                              roomDevices.length > 0
                                ? "hud-border-active bg-cyan-primary/10 text-cyan-primary"
                                : "hud-border bg-background/70 text-muted"
                            }`}
                          >
                            {roomDevices.length}{" "}
                            {roomDevices.length === 1 ? "Device" : "Devices"}
                          </span>
                          <ChevronRight
                            className="h-3.5 w-3.5 text-muted"
                            aria-hidden="true"
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
