"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Reusable modal form for creating and editing MongoDB-backed smart rooms.
 */
export default function RoomFormModal({
  isOpen,
  mode = "create",
  initialRoom = null,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      setValidationError(null);
      if (mode === "edit" && initialRoom) {
        setName(initialRoom.name || "");
        setDescription(initialRoom.description || "");
      } else {
        setName("");
        setDescription("");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, mode, initialRoom]);

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
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setValidationError("Room name is required.");
      return;
    }
    if (trimmedName.length > 80) {
      setValidationError("Room name cannot exceed 80 characters.");
      return;
    }
    if (trimmedDescription.length > 300) {
      setValidationError("Room description cannot exceed 300 characters.");
      return;
    }

    try {
      await onSubmit?.({
        name: trimmedName,
        description: trimmedDescription,
      });
    } catch (err) {
      setValidationError(err?.message || "Failed to save room.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose?.();
        }
      }}
    >
      <div className="hud-surface-elevated hud-border-active glow-cyan-sm w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 border-b hud-divider pb-3">
          <h2
            id="room-modal-title"
            className="font-display text-sm sm:text-base font-semibold tracking-wider text-foreground uppercase"
          >
            {mode === "edit" ? "Edit Room" : "Add New Room"}
          </h2>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close room form"
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
              htmlFor="room-name"
              className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
            >
              Room Name *
            </label>
            <input
              id="room-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smart Room 01"
              maxLength={80}
              required
              className="w-full rounded-xl bg-background/80 hud-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="room-description"
              className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
            >
              Description (Optional)
            </label>
            <textarea
              id="room-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Primary bedroom with ceiling lighting and fan"
              maxLength={300}
              className="w-full rounded-xl bg-background/80 hud-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none resize-none"
            />
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
              disabled={submitting}
              className="rounded-xl bg-cyan-primary/20 hud-border-active px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? "Saving..."
                : mode === "edit"
                  ? "Save Room"
                  : "Create Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

