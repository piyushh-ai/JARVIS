"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const DEVICE_TYPES = [
  { value: "light", label: "Light" },
  { value: "fan", label: "Fan" },
  { value: "led", label: "LED" },
  { value: "other", label: "Other" },
];

/**
 * Reusable modal form for creating and editing MongoDB-backed devices.
 */
export default function DeviceFormModal({
  isOpen,
  mode = "create",
  initialDevice = null,
  rooms = [],
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("light");
  const [roomId, setRoomId] = useState("");
  const [esp32DeviceId, setEsp32DeviceId] = useState("");
  const [relayNumber, setRelayNumber] = useState("");
  const [desiredState, setDesiredState] = useState("off");
  const [validationError, setValidationError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      setValidationError(null);
      if (mode === "edit" && initialDevice) {
        setName(initialDevice.name || "");
        setType(initialDevice.type || "other");
        setRoomId(String(initialDevice.roomId || ""));
        setEsp32DeviceId(initialDevice.esp32DeviceId || "");
        setRelayNumber(
          initialDevice.relayNumber !== null &&
            initialDevice.relayNumber !== undefined
            ? String(initialDevice.relayNumber)
            : ""
        );
        setDesiredState(initialDevice.desiredState || "off");
      } else {
        setName("");
        setType("light");
        setRoomId(rooms[0]?._id ? String(rooms[0]._id) : "");
        setEsp32DeviceId("");
        setRelayNumber("");
        setDesiredState("off");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, mode, initialDevice, rooms]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setValidationError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError("Device name is required.");
      return;
    }
    if (trimmedName.length > 80) {
      setValidationError("Device name cannot exceed 80 characters.");
      return;
    }
    if (!roomId) {
      setValidationError(
        rooms.length === 0
          ? "No rooms exist in MongoDB yet. Create a room first."
          : "Please select a room."
      );
      return;
    }

    let parsedRelay = null;
    if (relayNumber.trim() !== "") {
      const n = Number(relayNumber);
      if (!Number.isInteger(n) || n < 1 || n > 32) {
        setValidationError(
          "Relay number must be a whole integer between 1 and 32."
        );
        return;
      }
      parsedRelay = n;
    }

    const payload = {
      name: trimmedName,
      type,
      roomId,
      desiredState,
      esp32DeviceId: esp32DeviceId.trim() || null,
      relayNumber: parsedRelay,
    };

    try {
      await onSubmit?.(payload);
    } catch (err) {
      setValidationError(err?.message || "Failed to save device.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose?.();
        }
      }}
    >
      <div className="hud-surface-elevated hud-border-active glow-cyan-sm w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 border-b hud-divider pb-3">
          <h2
            id="device-modal-title"
            className="font-display text-sm sm:text-base font-semibold tracking-wider text-foreground uppercase"
          >
            {mode === "edit" ? "Edit Device" : "Add New Device"}
          </h2>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close device form"
            className="flex h-9 w-9 items-center justify-center rounded-xl hud-surface text-muted hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          {validationError && (
            <div
              role="alert"
              className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-200"
            >
              {validationError}
            </div>
          )}

          <div>
            <label
              htmlFor="device-name"
              className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
            >
              Device Name *
            </label>
            <input
              id="device-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Light"
              maxLength={80}
              required
              className="w-full rounded-xl bg-background/80 hud-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="device-type"
                className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
              >
                Device Type *
              </label>
              <select
                id="device-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl bg-background/80 hud-border px-3 py-2.5 text-sm text-foreground focus:border-cyan-primary focus:outline-none"
              >
                {DEVICE_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="device-room"
                className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
              >
                Room *
              </label>
              <select
                id="device-room"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                disabled={rooms.length === 0}
                className="w-full rounded-xl bg-background/80 hud-border px-3 py-2.5 text-sm text-foreground focus:border-cyan-primary focus:outline-none disabled:opacity-60"
              >
                {rooms.length === 0 ? (
                  <option value="">No rooms available</option>
                ) : (
                  rooms.map((room) => (
                    <option key={room._id} value={room._id}>
                      {room.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="esp32-id"
                className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
              >
                ESP32 Device ID (Optional)
              </label>
              <input
                id="esp32-id"
                type="text"
                value={esp32DeviceId}
                onChange={(e) => setEsp32DeviceId(e.target.value)}
                placeholder="e.g. esp32-room-01"
                maxLength={100}
                className="w-full rounded-xl bg-background/80 hud-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="relay-number"
                className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
              >
                Relay # (Optional, 1–32)
              </label>
              <input
                id="relay-number"
                type="number"
                min={1}
                max={32}
                step={1}
                value={relayNumber}
                onChange={(e) => setRelayNumber(e.target.value)}
                placeholder="1–32"
                className="w-full rounded-xl bg-background/80 hud-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="desired-state"
              className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
            >
              Desired State (Database Intent)
            </label>
            <select
              id="desired-state"
              value={desiredState}
              onChange={(e) => setDesiredState(e.target.value)}
              className="w-full rounded-xl bg-background/80 hud-border px-3 py-2.5 text-sm text-foreground focus:border-cyan-primary focus:outline-none"
            >
              <option value="off">OFF</option>
              <option value="on">ON</option>
            </select>
            <p className="mt-1.5 text-[11px] text-muted">
              Saves target intent in MongoDB only; reported hardware state
              remains independent until ESP32 sync is connected.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t hud-divider pt-4">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-xl hud-surface px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || rooms.length === 0}
              className="rounded-xl bg-cyan-primary/20 hud-border-active px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? "Saving..."
                : mode === "edit"
                  ? "Save Changes"
                  : "Create Device"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

