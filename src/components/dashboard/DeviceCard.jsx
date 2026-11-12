"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  Cpu,
  Fan,
  Lightbulb,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { prefersReducedMotion, supportsHover } from "@/lib/motion";

const DEVICE_ICONS = {
  light: Lightbulb,
  fan: Fan,
  led: Sparkles,
  other: Cpu,
};

const CONNECTION_BADGES = {
  online: {
    label: "Online",
    dot: "bg-cyan-primary",
    text: "text-cyan-primary",
  },
  offline: {
    label: "Offline",
    dot: "bg-red-400",
    text: "text-red-300",
  },
  unknown: {
    label: "HW Unknown",
    dot: "bg-amber-300/80",
    text: "text-muted",
  },
};

/**
 * Reusable MongoDB-backed device control card displaying device metadata,
 * distinct desiredState vs reportedState badges, connectionStatus, and edit/delete actions.
 */
export default function DeviceCard({
  device,
  roomName = "Unassigned Room",
  isBusy = false,
  syncState = null,
  onToggleDesired,
  onEdit,
  onDelete,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cardRef = useRef(null);
  const iconBadgeRef = useRef(null);
  const statusDotRef = useRef(null);
  const hasMountedRef = useRef(false);

  const isDesiredOn = device.desiredState === "on";
  const reportedState = device.reportedState || "unknown";
  const isReportedOn = reportedState === "on";
  const isMapped = Boolean(device.esp32DeviceId && device.relayNumber);
  const syncStatus = syncState?.status || null;
  const isPendingAck =
    syncStatus === "queuing" ||
    (isMapped && device.desiredState !== reportedState);
  const Icon = DEVICE_ICONS[device.type] ?? Cpu;
  const connBadge =
    CONNECTION_BADGES[device.connectionStatus] ?? CONNECTION_BADGES.unknown;

  useEffect(() => {
    const cardEl = cardRef.current;
    return () => {
      if (cardEl) gsap.killTweensOf(cardEl);
    };
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        iconBadgeRef.current,
        { scale: 0.86 },
        { scale: 1, duration: 0.28, ease: "back.out(2)", clearProps: "transform" }
      );
      gsap.fromTo(
        statusDotRef.current,
        { scale: 1.5, opacity: 0.6 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.25,
          ease: "power2.out",
          clearProps: "transform,opacity",
        }
      );
    }, cardRef);

    return () => ctx.revert();
  }, [isDesiredOn]);

  const handleMouseEnter = () => {
    if (!cardRef.current || prefersReducedMotion() || !supportsHover()) return;
    gsap.to(cardRef.current, {
      y: -2,
      duration: 0.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handleMouseLeave = () => {
    if (!cardRef.current || prefersReducedMotion() || !supportsHover()) return;
    gsap.to(cardRef.current, {
      y: 0,
      duration: 0.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handlePointerDown = () => {
    if (!cardRef.current || prefersReducedMotion()) return;
    gsap.to(cardRef.current, {
      scale: 0.98,
      duration: 0.12,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handlePointerRelease = () => {
    if (!cardRef.current || prefersReducedMotion()) return;
    gsap.to(cardRef.current, {
      scale: 1,
      duration: 0.18,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  return (
    <article
      ref={cardRef}
      data-gsap="device-card"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={
        isReportedOn
          ? {
              background:
                "linear-gradient(145deg, rgba(0, 229, 255, 0.08) 0%, rgba(11, 18, 32, 0.98) 65%)",
            }
          : isDesiredOn
            ? {
                background:
                  "linear-gradient(145deg, rgba(22, 119, 255, 0.07) 0%, rgba(11, 18, 32, 0.98) 65%)",
              }
            : undefined
      }
      className={`rounded-2xl p-4 flex flex-col justify-between gap-3.5 min-w-0 transition-[border-color,box-shadow,background-color] duration-200 ${
        isReportedOn
          ? "hud-surface hud-border-active glow-cyan-sm"
          : isDesiredOn
            ? "hud-surface border-blue-secondary/45"
            : "hud-surface border-white/10"
      } ${isBusy ? "opacity-75" : ""}`}
    >
      {/* Top row: Icon + Toggle Desired State */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            ref={iconBadgeRef}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
              isReportedOn
                ? "bg-cyan-primary/15 text-cyan-primary hud-border-active"
                : isDesiredOn
                  ? "bg-blue-secondary/15 text-cyan-primary border border-blue-secondary/40"
                  : "bg-white/5 text-muted border border-white/10"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold tracking-wide text-foreground truncate">
              {device.name}
            </h3>
            <p className="text-[11px] text-muted truncate">
              {roomName} · <span className="uppercase">{device.type}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-pressed={isDesiredOn}
          aria-label={`${device.name} desired state: ${
            isDesiredOn ? "ON" : "OFF"
          }. Tap to request toggle.`}
          onClick={() => onToggleDesired?.(device)}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerRelease}
          onPointerCancel={handlePointerRelease}
          onPointerLeave={handlePointerRelease}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors duration-200 cursor-pointer before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-[''] ${
            isDesiredOn
              ? "bg-cyan-primary/25 border border-cyan-primary"
              : "bg-white/10 border border-white/15"
          }`}
        >
          <span
            className={`inline-block h-5.5 w-5.5 rounded-full transition-transform duration-200 ${
              isDesiredOn
                ? "translate-x-6 bg-cyan-primary shadow-[0_0_8px_rgba(0,229,255,0.65)]"
                : "translate-x-0 bg-muted"
            }`}
          />
        </button>
      </div>

      {/* Telemetry State Grid: Desired vs Reported & Connection */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-background/55 hud-border p-2.5 text-[11px]">
        <div className="min-w-0">
          <span className="block text-[9px] uppercase tracking-wider text-muted">
            Desired State
          </span>
          <span
            className={`mt-0.5 inline-flex items-center gap-1.5 font-medium uppercase tracking-wider ${
              isDesiredOn ? "text-cyan-primary" : "text-foreground/85"
            }`}
          >
            <span
              ref={statusDotRef}
              className={`h-1.5 w-1.5 rounded-full ${
                isDesiredOn ? "bg-cyan-primary" : "bg-muted/70"
              }`}
              aria-hidden="true"
            />
            {device.desiredState}
          </span>
        </div>

        <div className="min-w-0">
          <span className="block text-[9px] uppercase tracking-wider text-muted">
            Reported State
          </span>
          <span
            className={`mt-0.5 inline-flex items-center gap-1.5 font-medium uppercase tracking-wider ${
              isReportedOn
                ? "text-cyan-primary"
                : reportedState === "off"
                  ? "text-foreground/80"
                  : "text-muted"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isReportedOn
                  ? "bg-cyan-primary"
                  : reportedState === "off"
                    ? "bg-foreground/60"
                    : "bg-amber-300/70"
              }`}
              aria-hidden="true"
            />
            {reportedState}
          </span>
        </div>
      </div>

      {/* Footer: Connection Status / Hardware ID + Edit / Delete */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t hud-divider pt-2.5 text-[11px]">
        <div className="min-w-0 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 font-medium ${connBadge.text}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connBadge.dot}`}
              aria-hidden="true"
            />
            {connBadge.label}
          </span>

          {device.esp32DeviceId && device.relayNumber ? (
            <span className="truncate text-[10px] text-muted tabular-nums">
              {device.esp32DeviceId} · R{device.relayNumber}
            </span>
          ) : (
            <span className="truncate text-[10px] text-amber-200/80">
              Unmapped (No ESP32)
            </span>
          )}

          {syncStatus === "failed" ? (
            <span
              title={syncState?.error || "Command failed"}
              className="rounded-full border border-red-400/40 bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300"
            >
              Cmd Failed
            </span>
          ) : syncStatus === "queuing" ? (
            <span className="rounded-full border border-cyan-primary/35 bg-cyan-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-primary animate-pulse">
              Queuing
            </span>
          ) : isPendingAck ? (
            <span className="rounded-full border border-amber-300/35 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-200">
              Pending HW ACK
            </span>
          ) : isMapped ? (
            <span className="rounded-full border border-cyan-primary/25 bg-cyan-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-primary/90">
              HW Synced
            </span>
          ) : null}
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onDelete?.(device._id)}
              className="rounded-lg bg-red-500/20 border border-red-400/50 px-2.5 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/30 cursor-pointer disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setConfirmDelete(false)}
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
              onClick={() => onEdit?.(device)}
              aria-label={`Edit ${device.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hud-surface text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${device.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hud-surface text-muted hover:text-red-300 hover:border-red-400/40 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
