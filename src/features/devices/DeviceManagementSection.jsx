"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Plus,
  RefreshCw,
} from "lucide-react";
import DeviceCard from "@/components/dashboard/DeviceCard";
import DeviceFormModal from "@/features/devices/DeviceFormModal";
import { prefersReducedMotion } from "@/lib/motion";

const TYPE_FILTERS = [
  { value: "", label: "All Types" },
  { value: "light", label: "Light" },
  { value: "fan", label: "Fan" },
  { value: "led", label: "LED" },
  { value: "other", label: "Other" },
];

/**
 * MongoDB-backed Device Management section supporting listing, room/type filtering,
 * creation, editing, desiredState toggling, deletion, and explicit feedback states.
 */
export default function DeviceManagementSection({
  devices = [],
  rooms = [],
  loading = false,
  mutating = false,
  error = null,
  roomsError = null,
  filterRoomId = "",
  filterType = "",
  onFilterRoomChange,
  onFilterTypeChange,
  onRefresh,
  onCreateDevice,
  onUpdateDevice,
  onDeleteDevice,
}) {
  const sectionRef = useRef(null);
  const hasAnimatedListRef = useRef(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editingDevice, setEditingDevice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const roomNameMap = useMemo(() => {
    const map = new Map();
    for (const room of rooms) {
      map.set(String(room._id), room.name);
    }
    return map;
  }, [rooms]);

  // Animate device cards once when initial database records finish loading
  useEffect(() => {
    if (loading || devices.length === 0 || hasAnimatedListRef.current) return;
    hasAnimatedListRef.current = true;

    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.from('[data-gsap="device-card"]', {
        y: 12,
        opacity: 0,
        duration: 0.34,
        stagger: 0.05,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [loading, devices.length]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingDevice(null);
    setModalOpen(true);
  };

  const openEditModal = (device) => {
    setModalMode("edit");
    setEditingDevice(device);
    setModalOpen(true);
  };

  const handleToggleDesired = async (device) => {
    const nextState = device.desiredState === "on" ? "off" : "on";
    setBusyId(device._id);
    try {
      await onUpdateDevice?.(device._id, { desiredState: nextState });
      setFeedback({
        type: "success",
        text: `Saved desiredState "${nextState.toUpperCase()}" for ${device.name} (awaiting ESP32 hardware sync).`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err?.message || `Failed to update ${device.name}.`,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    setBusyId(id);
    try {
      await onDeleteDevice?.(id);
      setFeedback({
        type: "success",
        text: "Device removed from MongoDB.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to delete device.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleFormSubmit = async (payload) => {
    const matchesRoomFilter = !filterRoomId || payload.roomId === filterRoomId;
    const matchesTypeFilter = !filterType || payload.type === filterType;
    const filterNote =
      !matchesRoomFilter || !matchesTypeFilter
        ? " (outside active filters)"
        : "";

    if (modalMode === "edit" && editingDevice) {
      await onUpdateDevice?.(editingDevice._id, payload);
      setModalOpen(false);
      setFeedback({
        type: "success",
        text: `Updated "${payload.name}" in MongoDB.${filterNote}`,
      });
    } else {
      await onCreateDevice?.(payload);
      setModalOpen(false);
      setFeedback({
        type: "success",
        text: `Created "${payload.name}" in MongoDB.${filterNote}`,
      });
    }
  };

  return (
    <section
      id="devices-section"
      ref={sectionRef}
      aria-labelledby="devices-heading"
      className="space-y-3.5 scroll-mt-20"
      data-gsap="devices-section"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2
            id="devices-heading"
            className="font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            Room Devices
          </h2>
          <p className="text-[11px] text-muted">
            MongoDB Atlas device registry & desired state controls
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => onRefresh?.()}
            aria-label="Refresh devices"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl hud-surface px-3 text-xs font-medium text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                loading ? "animate-spin motion-reduce:animate-none" : ""
              }`}
              aria-hidden="true"
            />
            <span className="hidden xs:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-cyan-primary/18 hud-border-active px-3.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/28 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Device</span>
          </button>
        </div>
      </div>

      {/* Room & Type Filters */}
      <div className="grid grid-cols-2 gap-2.5">
        <select
          aria-label="Filter devices by room"
          value={filterRoomId}
          onChange={(e) => onFilterRoomChange?.(e.target.value)}
          className="w-full rounded-xl hud-surface px-3 py-2 text-xs text-foreground focus:border-cyan-primary focus:outline-none"
        >
          <option value="">All Rooms</option>
          {rooms.map((room) => (
            <option key={room._id} value={room._id}>
              {room.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter devices by type"
          value={filterType}
          onChange={(e) => onFilterTypeChange?.(e.target.value)}
          className="w-full rounded-xl hud-surface px-3 py-2 text-xs text-foreground focus:border-cyan-primary focus:outline-none"
        >
          {TYPE_FILTERS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`flex items-start justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs ${
            feedback.type === "error"
              ? "border border-red-400/40 bg-red-500/10 text-red-200"
              : "hud-border-active bg-cyan-primary/10 text-cyan-primary"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {feedback.type === "error" ? (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {roomsError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200"
        >
          Unable to load rooms list: {roomsError}
        </div>
      )}

      {/* Content States: Loading / Error / Empty / Device Grid */}
      {loading && devices.length === 0 ? (
        <div
          role="status"
          aria-label="Loading devices"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
        >
          {[0, 1].map((slot) => (
            <div
              key={slot}
              className="hud-surface rounded-2xl p-4 h-[178px] animate-pulse flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-xl bg-white/10" />
                <div className="h-8 w-14 rounded-full bg-white/10" />
              </div>
              <div className="h-12 rounded-xl bg-white/5" />
              <div className="h-4 w-1/2 rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="hud-surface rounded-2xl border-red-400/40 p-5 text-center space-y-3"
        >
          <AlertTriangle
            className="mx-auto h-6 w-6 text-red-300"
            aria-hidden="true"
          />
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              Failed to load devices
            </p>
            <p className="mt-1 text-xs text-muted">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => onRefresh?.()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-primary/18 hud-border-active px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/28 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : devices.length === 0 ? (
        <div className="hud-surface rounded-2xl p-6 text-center space-y-3">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-primary/10 hud-border-active text-cyan-primary">
            <Cpu className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              {filterRoomId || filterType
                ? "No devices match current filters"
                : "No devices registered yet"}
            </p>
            <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
              {rooms.length === 0
                ? "Create a room in the Rooms section first, then register devices here."
                : "Add your first smart room device to persist configuration and desired state in MongoDB Atlas."}
            </p>
          </div>
          {rooms.length > 0 && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-primary/18 hud-border-active px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/28 cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add First Device
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {devices.map((device) => (
            <DeviceCard
              key={device._id}
              device={device}
              roomName={
                roomNameMap.get(String(device.roomId)) || "Assigned Room"
              }
              isBusy={busyId === device._id}
              onToggleDesired={handleToggleDesired}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <DeviceFormModal
        isOpen={modalOpen}
        mode={modalMode}
        initialDevice={editingDevice}
        rooms={rooms}
        submitting={mutating}
        onClose={() => setModalOpen(false)}
        onSubmit={handleFormSubmit}
      />
    </section>
  );
}
