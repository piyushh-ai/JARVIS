"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  LightbulbOff,
  Loader2,
  Moon,
  ShieldAlert,
  Sparkles,
  Sun,
} from "lucide-react";
import { SMART_SCENES } from "@/lib/scenes/sceneDefinitions";
import { prefersReducedMotion } from "@/lib/motion";
import { executeScene } from "@/services/sceneApi";

const SCENE_ICONS = {
  good_morning: Sun,
  good_night: Moon,
  away_mode: ShieldAlert,
  all_lights_on: Lightbulb,
  all_lights_off: LightbulbOff,
};

const COOLDOWN_MS = 2500;
let sceneClickSeq = 0;

function createSceneIdempotencyKey(sceneId) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sc_${sceneId}_${crypto.randomUUID()}`;
  }
  sceneClickSeq += 1;
  return `sc_${sceneId}_${Date.now()}_${sceneClickSeq}`;
}

function countPreviewTargets(sceneId, devices = []) {
  if (!Array.isArray(devices) || devices.length === 0) return 0;
  if (sceneId === "good_night" || sceneId === "away_mode") {
    return devices.length;
  }
  if (sceneId === "all_lights_on" || sceneId === "all_lights_off") {
    return devices.filter((d) => String(d.type).toLowerCase() === "light").length;
  }
  if (sceneId === "good_morning") {
    const names = new Set();
    for (const d of devices) {
      const norm = String(d.name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (/\bmain\s*light\b/i.test(norm)) names.add("main");
      if (/\bmandir\s*light\b/i.test(norm)) names.add("mandir");
    }
    return names.size;
  }
  return 0;
}

/**
 * Futuristic HUD Quick Smart Scenes panel executing dynamically resolved
 * MongoDB device groups through the authenticated command queue pipeline.
 */
export default function SmartScenesSection({
  homeId = "",
  devices = [],
  onSceneComplete,
}) {
  const sectionRef = useRef(null);
  const inFlightRef = useRef(false);
  const cooldownTimersRef = useRef(new Map());

  const [executingId, setExecutingId] = useState(null);
  const [cooldownByScene, setCooldownByScene] = useState({});
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const timers = cooldownTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!sectionRef.current || prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.from('[data-gsap="scene-btn"]', {
        y: 8,
        opacity: 0,
        duration: 0.28,
        stagger: 0.04,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const previewCounts = useMemo(() => {
    const map = {};
    for (const scene of SMART_SCENES) {
      map[scene.id] = countPreviewTargets(scene.id, devices);
    }
    return map;
  }, [devices]);

  const startSceneCooldown = (sceneId) => {
    const existing = cooldownTimersRef.current.get(sceneId);
    if (existing) clearTimeout(existing);

    setCooldownByScene((prev) => ({ ...prev, [sceneId]: true }));
    const timer = setTimeout(() => {
      cooldownTimersRef.current.delete(sceneId);
      setCooldownByScene((prev) => {
        if (!prev[sceneId]) return prev;
        const copy = { ...prev };
        delete copy[sceneId];
        return copy;
      });
    }, COOLDOWN_MS);
    cooldownTimersRef.current.set(sceneId, timer);
  };

  const handleTriggerScene = async (scene) => {
    if (inFlightRef.current || cooldownByScene[scene.id] || !homeId) return;

    inFlightRef.current = true;
    setExecutingId(scene.id);
    setFeedback(null);

    const idempotencyKey = createSceneIdempotencyKey(scene.id);

    try {
      const { message, data } = await executeScene(scene.id, {
        homeId,
        idempotencyKey,
      });

      if (data) {
        onSceneComplete?.(data);
      }

      startSceneCooldown(scene.id);

      setFeedback({
        kind: data?.outcome === "partial" ? "partial" : "success",
        sceneName: scene.name,
        message:
          message ||
          `Scene "${scene.name}" dispatched (${data?.queuedCount || 0} queued).`,
        results: Array.isArray(data?.results) ? data.results : [],
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        sceneName: scene.name,
        message: err?.message || `Failed to execute "${scene.name}".`,
        errors: Array.isArray(err?.errors) ? err.errors : [],
        results: [],
      });
    } finally {
      inFlightRef.current = false;
      setExecutingId(null);
    }
  };

  const isAnyExecuting = executingId !== null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="smart-scenes-heading"
      data-gsap="smart-scenes"
      className="hud-surface rounded-2xl p-4 sm:p-5 space-y-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-primary/10 hud-border-active text-cyan-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="smart-scenes-heading"
              className="font-display text-sm sm:text-base font-semibold tracking-wider text-foreground truncate"
            >
              Smart Scenes
            </h2>
            <p className="text-[11px] text-muted truncate">
              One-tap presets · Authenticated ESP32 queue
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            isAnyExecuting
              ? "border border-blue-secondary/50 bg-blue-secondary/15 text-foreground"
              : "hud-border-active bg-cyan-primary/10 text-cyan-primary"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isAnyExecuting ? "bg-blue-secondary animate-ping" : "bg-cyan-primary"
            }`}
            aria-hidden="true"
          />
          {isAnyExecuting ? "Queuing" : "Ready"}
        </span>
      </div>

      {/* Scene Action Buttons Grid */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
        {SMART_SCENES.map((scene) => {
          const Icon = SCENE_ICONS[scene.id] ?? Sparkles;
          const isRunning = executingId === scene.id;
          const isCooling = Boolean(cooldownByScene[scene.id]);
          const isDisabled = !homeId || isAnyExecuting || isCooling;
          const targetCount = previewCounts[scene.id] ?? 0;

          return (
            <button
              key={scene.id}
              type="button"
              data-gsap="scene-btn"
              disabled={isDisabled}
              aria-busy={isRunning}
              aria-label={`Activate ${scene.name} scene: ${scene.description}`}
              onClick={() => handleTriggerScene(scene)}
              className={`group relative flex flex-col justify-between gap-2 rounded-xl p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 min-h-[78px] ${
                isRunning
                  ? "hud-surface hud-border-active bg-cyan-primary/12 glow-cyan-sm cursor-wait"
                  : isCooling
                    ? "hud-surface border-cyan-primary/40 bg-cyan-primary/8 cursor-not-allowed"
                    : isDisabled
                      ? "hud-surface border-white/10 opacity-60 cursor-not-allowed"
                      : "hud-surface border-white/10 hover:hud-border-active hover:bg-cyan-primary/8 active:scale-[0.98] cursor-pointer"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isRunning || isCooling
                      ? "border-cyan-primary/50 bg-cyan-primary/15 text-cyan-primary"
                      : "border-white/10 bg-white/5 text-cyan-primary group-hover:border-cyan-primary/40 group-hover:bg-cyan-primary/10"
                  }`}
                >
                  {isRunning ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : isCooling ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </span>

                <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted border border-white/10 tabular-nums">
                  {isRunning
                    ? "Running"
                    : isCooling
                      ? "Sent"
                      : `${targetCount} ${targetCount === 1 ? "dev" : "devs"}`}
                </span>
              </div>

              <div className="min-w-0">
                <p className="font-display text-xs font-semibold tracking-wide text-foreground truncate">
                  {scene.name}
                </p>
                <p className="mt-0.5 text-[10px] text-muted truncate">
                  {scene.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Explicit Loading / Success / Partial Failure / Error Banner */}
      {feedback && (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`rounded-xl px-3.5 py-2.5 text-xs space-y-2 ${
            feedback.kind === "error"
              ? "border border-red-400/40 bg-red-500/10 text-red-200"
              : feedback.kind === "partial"
                ? "border border-amber-300/40 bg-amber-400/10 text-amber-100"
                : "hud-border-active bg-cyan-primary/10 text-cyan-primary"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex items-start gap-2">
              {feedback.kind === "success" ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <span>{feedback.message}</span>
            </span>

            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>

          {feedback.results?.length > 0 && (
            <ul className="space-y-1 border-t border-white/10 pt-2 text-[11px]">
              {feedback.results.map((entry, idx) => (
                <li
                  key={`${entry.deviceId || entry.deviceName}_${idx}`}
                  className="flex items-start justify-between gap-2"
                >
                  <span className="truncate font-medium">
                    {entry.status === "queued" ? "✓" : "✗"} {entry.deviceName}
                    {entry.relayNumber ? ` (R${entry.relayNumber})` : ""} →{" "}
                    {entry.action?.toUpperCase()}
                  </span>
                  <span className="shrink-0 text-[10px] opacity-85">
                    {entry.status === "queued"
                      ? entry.idempotentReplay
                        ? "Replayed"
                        : "Queued"
                      : entry.error || "Failed"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {feedback.errors?.length > 0 && (
            <ul className="space-y-0.5 border-t border-red-400/20 pt-1.5 text-[11px] text-red-200/90">
              {feedback.errors.map((errLine, idx) => (
                <li key={idx}>• {errLine}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
