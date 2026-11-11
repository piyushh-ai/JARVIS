"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldBan,
} from "lucide-react";
import ControllerProvisionModal from "@/features/controllers/ControllerProvisionModal";
import { prefersReducedMotion } from "@/lib/motion";

const HEARTBEAT_ONLINE_WINDOW_MS = 60 * 1000;

function getControllerConnectivity(controller, nowMs) {
  if (controller.status === "revoked") {
    return {
      label: "Revoked",
      dot: "bg-red-400",
      text: "text-red-300",
      border: "border-red-400/35",
    };
  }

  if (!controller.lastSeen) {
    return {
      label: "Awaiting Heartbeat",
      dot: "bg-amber-300/80",
      text: "text-amber-200",
      border: "border-amber-400/30",
    };
  }

  if (nowMs !== null) {
    const lastSeenMs = new Date(controller.lastSeen).getTime();
    if (!Number.isNaN(lastSeenMs) && nowMs - lastSeenMs <= HEARTBEAT_ONLINE_WINDOW_MS) {
      return {
        label: "Online",
        dot: "bg-cyan-primary shadow-[0_0_6px_rgba(0,229,255,0.85)]",
        text: "text-cyan-primary",
        border: "hud-border-active",
      };
    }
  }

  return {
    label: "Offline",
    dot: "bg-red-400",
    text: "text-red-300",
    border: "border-white/15",
  };
}

/**
 * MongoDB-backed ESP32 Controller Management section inside the authenticated dashboard.
 */
export default function ControllerManagementSection({
  controllers = [],
  devices = [],
  loading = false,
  mutating = false,
  error = null,
  canManage = false,
  onRefresh,
  onProvision,
  onRotate,
  onRevoke,
}) {
  const sectionRef = useRef(null);
  const hasAnimatedRef = useRef(false);

  const [nowMs, setNowMs] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    const initTimer = setTimeout(updateNow, 0);
    const interval = setInterval(updateNow, 15000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [controllers.length, onRefresh]);

  useEffect(() => {
    if (loading || controllers.length === 0 || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.from('[data-gsap="controller-card"]', {
        y: 12,
        opacity: 0,
        duration: 0.34,
        stagger: 0.05,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [loading, controllers.length]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const devicesByController = useMemo(() => {
    const map = new Map();
    for (const device of devices) {
      if (!device.esp32DeviceId) continue;
      const list = map.get(device.esp32DeviceId) || [];
      list.push(device);
      map.set(device.esp32DeviceId, list);
    }
    return map;
  }, [devices]);

  const handleProvisionSubmit = async (payload) => {
    const res = await onProvision?.(payload);
    if (res?.rawToken) {
      setOneTimeSecret({
        mode: "provision",
        controller: res.controller,
        rawToken: res.rawToken,
      });
      setModalOpen(true);
      setFeedback({
        type: "success",
        text: `Provisioned controller "${res.controller?.esp32DeviceId}". Store the one-time bearer token securely.`,
      });
    }
  };

  const handleRotate = async (controller) => {
    setBusyId(controller._id);
    setConfirmAction(null);
    try {
      const res = await onRotate?.(controller._id);
      if (res?.rawToken) {
        setOneTimeSecret({
          mode: "rotate",
          controller: res.controller,
          rawToken: res.rawToken,
        });
        setModalOpen(true);
        setFeedback({
          type: "success",
          text: `Issued replacement token v${res.controller?.tokenVersion} for "${controller.esp32DeviceId}".`,
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to rotate controller token.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (controller) => {
    setBusyId(controller._id);
    setConfirmAction(null);
    try {
      await onRevoke?.(controller._id);
      setFeedback({
        type: "success",
        text: `Revoked controller "${controller.esp32DeviceId}" and marked mapped devices offline.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to revoke controller.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      id="controllers-section"
      ref={sectionRef}
      aria-labelledby="controllers-heading"
      className="space-y-3.5 scroll-mt-20"
      data-gsap="controllers-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2
            id="controllers-heading"
            className="font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            ESP32 Controllers
          </h2>
          <p className="text-[11px] text-muted">
            Provisioned hardware nodes, one-time token issuance & Relay #1 mapping
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => onRefresh?.()}
            aria-label="Refresh controllers"
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

          {canManage && (
            <button
              type="button"
              onClick={() => {
                setOneTimeSecret(null);
                setModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-cyan-primary/18 hud-border-active px-3.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/28 cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Provision ESP32</span>
            </button>
          )}
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

      {loading && controllers.length === 0 ? (
        <div
          role="status"
          aria-label="Loading controllers"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
        >
          {[0, 1].map((slot) => (
            <div
              key={slot}
              className="hud-surface rounded-2xl p-4 h-[168px] animate-pulse flex flex-col justify-between"
            >
              <div className="h-5 w-1/2 rounded bg-white/10" />
              <div className="h-12 rounded-xl bg-white/5" />
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
              Failed to load ESP32 controllers
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
      ) : controllers.length === 0 ? (
        <div className="hud-surface rounded-2xl p-6 text-center space-y-3">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-primary/10 hud-border-active text-cyan-primary">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              Unprovisioned · No ESP32 Controllers Registered
            </p>
            <p className="mt-1 text-xs text-muted max-w-md mx-auto">
              {canManage
                ? "Provision your ESP32 board to issue a one-time bearer token, configure Relay Channel 1, and pair smart devices in this Home."
                : "Ask a Home Owner or Admin to provision an ESP32 controller before physical device toggling is available."}
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setOneTimeSecret(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-primary/18 hud-border-active px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/28 cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Provision First ESP32
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
          {controllers.map((controller) => {
            const conn = getControllerConnectivity(controller, nowMs);
            const mappedDevices =
              devicesByController.get(controller.esp32DeviceId) || [];
            const ch1 = (controller.relayConfig || []).find(
              (ch) => ch.relayNumber === 1
            );
            const isBusy = busyId === controller._id;
            const isConfirmingRotate =
              confirmAction?.id === controller._id &&
              confirmAction.type === "rotate";
            const isConfirmingRevoke =
              confirmAction?.id === controller._id &&
              confirmAction.type === "revoke";

            return (
              <article
                key={controller._id}
                data-gsap="controller-card"
                className={`rounded-2xl p-4 hud-surface ${conn.border} flex flex-col justify-between gap-3.5 min-w-0 ${
                  isBusy ? "opacity-75" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-primary/10 hud-border-active text-cyan-primary">
                      <Cpu className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold tracking-wide text-foreground truncate">
                        {controller.name || controller.esp32DeviceId}
                      </h3>
                      <p className="text-[11px] text-muted font-mono truncate">
                        {controller.esp32DeviceId}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider hud-surface ${conn.text} shrink-0`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${conn.dot}`}
                      aria-hidden="true"
                    />
                    {conn.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl bg-background/55 hud-border p-2.5 text-[11px]">
                  <div className="min-w-0">
                    <span className="block text-[9px] uppercase tracking-wider text-muted">
                      Token Prefix
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-foreground">
                      {controller.tokenPrefix || "Revoked"} · v
                      {controller.tokenVersion || 1}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <span className="block text-[9px] uppercase tracking-wider text-muted">
                      Last Heartbeat
                    </span>
                    <span className="mt-0.5 block truncate text-foreground">
                      {controller.lastSeen && nowMs !== null
                        ? new Date(controller.lastSeen).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : controller.lastSeen
                          ? "Recorded"
                          : "Never"}
                    </span>
                  </div>

                  <div className="min-w-0 col-span-2 sm:col-span-1">
                    <span className="block text-[9px] uppercase tracking-wider text-muted">
                      Firmware
                    </span>
                    <span className="mt-0.5 block truncate text-foreground">
                      {controller.firmwareVersion || "Unreported"}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-muted">
                    <span className="uppercase tracking-wider text-[10px] font-semibold">
                      Relay #1 Config
                    </span>
                    <span className="text-foreground/90">
                      {ch1
                        ? `GPIO ${
                            ch1.gpioPin !== null && ch1.gpioPin !== undefined
                              ? ch1.gpioPin
                              : "Unset"
                          } · ${
                            ch1.activeLevel
                              ? `Active ${ch1.activeLevel}`
                              : "Polarity unverified"
                          }`
                        : "Channel 1 not configured"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted">
                      Mapped Devices:
                    </span>
                    {mappedDevices.length === 0 ? (
                      <span className="text-muted">None assigned</span>
                    ) : (
                      mappedDevices.map((dev) => (
                        <span
                          key={dev._id}
                          className="rounded-md bg-cyan-primary/10 border border-cyan-primary/25 px-2 py-0.5 text-[10px] font-medium text-cyan-primary"
                        >
                          {dev.name} (R{dev.relayNumber ?? "?"})
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {canManage && controller.status !== "revoked" && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t hud-divider pt-2.5 text-[11px]">
                    {isConfirmingRotate ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted">Rotate token?</span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRotate(controller)}
                          className="rounded-lg bg-cyan-primary/20 hud-border-active px-2.5 py-1 font-medium text-cyan-primary cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmAction(null)}
                          className="rounded-lg hud-surface px-2 py-1 text-muted hover:text-foreground cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : isConfirmingRevoke ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-red-300">Revoke controller?</span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRevoke(controller)}
                          className="rounded-lg bg-red-500/20 border border-red-400/50 px-2.5 py-1 font-medium text-red-200 cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmAction(null)}
                          className="rounded-lg hud-surface px-2 py-1 text-muted hover:text-foreground cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setConfirmAction({
                              id: controller._id,
                              type: "rotate",
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg hud-surface px-2.5 py-1 text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer disabled:opacity-50"
                        >
                          <RotateCw className="h-3 w-3" aria-hidden="true" />
                          <span>Rotate Token</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setConfirmAction({
                              id: controller._id,
                              type: "revoke",
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg hud-surface px-2.5 py-1 text-muted hover:text-red-300 hover:border-red-400/40 cursor-pointer disabled:opacity-50"
                        >
                          <ShieldBan className="h-3 w-3" aria-hidden="true" />
                          <span>Revoke</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ControllerProvisionModal
        isOpen={modalOpen}
        submitting={mutating}
        oneTimeSecret={oneTimeSecret}
        onClose={() => setModalOpen(false)}
        onClearSecret={() => setOneTimeSecret(null)}
        onSubmit={handleProvisionSubmit}
      />
    </section>
  );
}

