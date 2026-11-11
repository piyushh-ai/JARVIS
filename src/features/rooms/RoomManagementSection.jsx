"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Home,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import RoomFormModal from "@/features/rooms/RoomFormModal";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * MongoDB-backed Room Management section displaying all rooms, their assigned
 * device counts and device summaries, and safe create/edit/delete workflows.
 */
export default function RoomManagementSection({
  rooms = [],
  devices = [],
  devicesByRoom: providedDevicesByRoom,
  loading = false,
  mutating = false,
  error = null,
  selectedRoomId = "",
  onSelectRoomFilter,
  onRefresh,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
}) {
  const sectionRef = useRef(null);
  const hasAnimatedRoomsRef = useRef(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editingRoom, setEditingRoom] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyRoomId, setBusyRoomId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const localDevicesByRoom = useMemo(() => {
    if (providedDevicesByRoom) return null;
    const map = new Map();
    for (const device of devices) {
      const key = String(device.roomId);
      const list = map.get(key) || [];
      list.push(device);
      map.set(key, list);
    }
    return map;
  }, [devices, providedDevicesByRoom]);

  const devicesByRoom = providedDevicesByRoom || localDevicesByRoom;

  useEffect(() => {
    if (loading || rooms.length === 0 || hasAnimatedRoomsRef.current) return;
    hasAnimatedRoomsRef.current = true;

    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.from('[data-gsap="room-card"]', {
        y: 12,
        opacity: 0,
        duration: 0.34,
        stagger: 0.05,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [loading, rooms.length]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingRoom(null);
    setModalOpen(true);
  };

  const openEditModal = (room) => {
    setModalMode("edit");
    setEditingRoom(room);
    setModalOpen(true);
  };

  const handleFormSubmit = async (payload) => {
    if (modalMode === "edit" && editingRoom) {
      await onUpdateRoom?.(editingRoom._id, payload);
      setModalOpen(false);
      setFeedback({
        type: "success",
        text: `Updated room "${payload.name}" in MongoDB.`,
      });
    } else {
      await onCreateRoom?.(payload);
      setModalOpen(false);
      setFeedback({
        type: "success",
        text: `Created room "${payload.name}" in MongoDB.`,
      });
    }
  };

  const handleDeleteRoom = async (room) => {
    setBusyRoomId(room._id);
    try {
      await onDeleteRoom?.(room._id);
      setConfirmDeleteId(null);
      setFeedback({
        type: "success",
        text: `Deleted room "${room.name}" from MongoDB.`,
      });
    } catch (err) {
      setConfirmDeleteId(null);
      setFeedback({
        type: "error",
        text:
          err?.message ||
          `Cannot delete "${room.name}". Ensure no devices remain assigned to it.`,
      });
    } finally {
      setBusyRoomId(null);
    }
  };

  return (
    <section
      id="rooms-section"
      ref={sectionRef}
      aria-labelledby="rooms-heading"
      className="space-y-3.5 scroll-mt-20"
      data-gsap="rooms-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2
            id="rooms-heading"
            className="font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            Rooms
          </h2>
          <p className="text-[11px] text-muted">
            Manage smart rooms & associated device assignments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => onRefresh?.()}
            aria-label="Refresh rooms"
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
            <span>Add Room</span>
          </button>
        </div>
      </div>

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

      {loading && rooms.length === 0 ? (
        <div
          role="status"
          aria-label="Loading rooms"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
        >
          {[0, 1].map((slot) => (
            <div
              key={slot}
              className="hud-surface rounded-2xl p-4 h-[156px] animate-pulse flex flex-col justify-between"
            >
              <div className="h-5 w-1/2 rounded bg-white/10" />
              <div className="h-10 rounded-xl bg-white/5" />
              <div className="h-4 w-1/3 rounded bg-white/10" />
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
              Failed to load rooms
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
      ) : rooms.length === 0 ? (
        <div className="hud-surface rounded-2xl p-6 text-center space-y-3">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-primary/10 hud-border-active text-cyan-primary">
            <Home className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              No rooms created yet
            </p>
            <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
              Create your first smart room in MongoDB Atlas to organize and
              assign room devices.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-primary/18 hud-border-active px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/28 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add First Room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {rooms.map((room) => {
            const roomDevices = devicesByRoom.get(String(room._id)) || [];
            const isSelected = selectedRoomId === String(room._id);
            const isConfirming = confirmDeleteId === room._id;
            const isBusy = busyRoomId === room._id;

            return (
              <article
                key={room._id}
                data-gsap="room-card"
                className={`rounded-2xl p-4 flex flex-col justify-between gap-3.5 min-w-0 transition-[border-color,box-shadow] duration-200 ${
                  isSelected
                    ? "hud-surface hud-border-active glow-cyan-sm"
                    : "hud-surface border-white/10"
                } ${isBusy ? "opacity-75" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-primary/12 hud-border-active text-cyan-primary">
                      <Home className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold tracking-wide text-foreground truncate">
                        {room.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted line-clamp-2">
                        {room.description || "No description"}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider hud-border bg-background/60 text-cyan-primary tabular-nums">
                    {roomDevices.length}{" "}
                    {roomDevices.length === 1 ? "Device" : "Devices"}
                  </span>
                </div>

                {/* Associated devices list */}
                <div className="rounded-xl bg-background/55 hud-border p-2.5 space-y-1.5">
                  <span className="block text-[9px] uppercase tracking-wider text-muted">
                    Assigned Devices
                  </span>
                  {roomDevices.length === 0 ? (
                    <p className="text-[11px] text-muted">
                      No devices assigned
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {roomDevices.map((device) => (
                        <li
                          key={device._id}
                          className="inline-flex items-center gap-1.5 rounded-lg hud-surface px-2 py-1 text-[11px] text-foreground max-w-full"
                        >
                          <Cpu
                            className="h-3 w-3 shrink-0 text-cyan-primary"
                            aria-hidden="true"
                          />
                          <span className="truncate">{device.name}</span>
                          <span
                            className={`text-[9px] uppercase font-medium ${
                              device.desiredState === "on"
                                ? "text-cyan-primary"
                                : "text-muted"
                            }`}
                          >
                            {device.desiredState}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Actions + Safe delete feedback */}
                <div className="space-y-2 border-t hud-divider pt-2.5">
                  {isConfirming && roomDevices.length > 0 && (
                    <p className="text-[11px] text-amber-200">
                      Cannot delete while {roomDevices.length} device(s) are
                      assigned. Delete or reassign them first.
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectRoomFilter?.(
                          isSelected ? "" : String(room._id)
                        )
                      }
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-cyan-primary/18 hud-border-active text-cyan-primary"
                          : "hud-surface text-muted hover:text-foreground"
                      }`}
                    >
                      {isSelected ? "Showing Room" : "Filter Devices"}
                    </button>

                    {isConfirming ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeleteRoom(room)}
                          className="rounded-lg bg-red-500/20 border border-red-400/50 px-2.5 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/30 cursor-pointer disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg hud-surface px-2 py-1 text-[11px] text-muted hover:text-foreground cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => openEditModal(room)}
                          aria-label={`Edit ${room.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg hud-surface text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(room._id)}
                          aria-label={`Delete ${room.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg hud-surface text-muted hover:text-red-300 hover:border-red-400/40 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <RoomFormModal
        isOpen={modalOpen}
        mode={modalMode}
        initialRoom={editingRoom}
        submitting={mutating}
        onClose={() => setModalOpen(false)}
        onSubmit={handleFormSubmit}
      />
    </section>
  );
}

