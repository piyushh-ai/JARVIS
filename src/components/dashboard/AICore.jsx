"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Circular futuristic JARVIS AI Core hero centerpiece with multi-speed GSAP ring
 * rotation, subtle core glow pulse, radial radar scan, and stationary central branding.
 */
export default function AICore({
  statusLabel = "SYSTEM STANDBY",
  totalRooms = 0,
  totalDevices = 0,
  desiredOnCount = 0,
  syncNote = "MongoDB Atlas Sync",
}) {
  const coreContainerRef = useRef(null);
  const outerRingRef = useRef(null);
  const middleRingRef = useRef(null);
  const innerRingRef = useRef(null);
  const scanBeamRef = useRef(null);
  const glowRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let ctx;

    const startAnimations = () => {
      ctx?.revert();
      if (mediaQuery.matches) return;

      ctx = gsap.context(() => {
        gsap.to(outerRingRef.current, {
          rotation: 360,
          duration: 34,
          repeat: -1,
          ease: "none",
          transformOrigin: "50% 50%",
        });

        gsap.to(middleRingRef.current, {
          rotation: -360,
          duration: 22,
          repeat: -1,
          ease: "none",
          transformOrigin: "50% 50%",
        });

        gsap.to(innerRingRef.current, {
          rotation: 360,
          duration: 15,
          repeat: -1,
          ease: "none",
          transformOrigin: "50% 50%",
        });

        gsap.to(glowRef.current, {
          scale: 1.07,
          opacity: 0.78,
          duration: 2.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });

        gsap.to(scanBeamRef.current, {
          rotation: 360,
          duration: 7,
          repeat: -1,
          ease: "none",
          transformOrigin: "50% 50%",
        });
      }, coreContainerRef);
    };

    startAnimations();
    mediaQuery.addEventListener("change", startAnimations);

    return () => {
      mediaQuery.removeEventListener("change", startAnimations);
      ctx?.revert();
    };
  }, []);

  return (
    <section
      ref={coreContainerRef}
      data-gsap="ai-core"
      aria-label="JARVIS AI Core"
      className="hud-surface relative flex flex-col items-center justify-between overflow-hidden rounded-2xl px-5 py-6 sm:px-7 sm:py-7 text-center"
      style={{
        background:
          "radial-gradient(circle at 50% 38%, rgba(22, 119, 255, 0.1) 0%, rgba(11, 18, 32, 0.96) 62%)",
      }}
    >
      <div className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-primary/80" />
          Core Module
        </span>
        <span className="tabular-nums text-cyan-primary/85">Mark I · HUD</span>
      </div>

      <div className="relative my-5 flex h-44 w-44 sm:h-52 sm:w-52 items-center justify-center">
        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-1 rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(0, 229, 255, 0.25) 0%, rgba(22, 119, 255, 0.14) 46%, transparent 72%)",
          }}
          aria-hidden="true"
        />

        <div
          ref={scanBeamRef}
          className="pointer-events-none absolute inset-2 rounded-full opacity-55"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(0, 229, 255, 0.22) 0deg, rgba(0, 229, 255, 0.04) 42deg, transparent 88deg, transparent 360deg)",
            maskImage:
              "radial-gradient(circle closest-side, transparent 58%, black 60%, black 98%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(circle closest-side, transparent 58%, black 60%, black 98%, transparent 100%)",
          }}
          aria-hidden="true"
        />

        <svg
          ref={outerRingRef}
          viewBox="0 0 200 200"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <circle
            cx="100"
            cy="100"
            r="96"
            fill="none"
            stroke="rgba(0, 229, 255, 0.28)"
            strokeWidth="1"
            strokeDasharray="6 6"
          />
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="rgba(22, 119, 255, 0.35)"
            strokeWidth="1.5"
            strokeDasharray="36 28 10 28"
          />
        </svg>

        <div
          ref={middleRingRef}
          className="pointer-events-none absolute inset-4 rounded-full border border-blue-secondary/45 border-t-cyan-primary border-b-cyan-primary/70"
          aria-hidden="true"
        />

        <div
          ref={innerRingRef}
          className="pointer-events-none absolute inset-7 rounded-full border border-dashed border-cyan-primary/40"
          aria-hidden="true"
        />

        <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 flex-col items-center justify-center rounded-full hud-surface-elevated hud-border-active glow-cyan px-3">
          <span className="font-display text-base sm:text-lg font-bold tracking-[0.22em] text-foreground glow-cyan-text">
            JARVIS
          </span>
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-primary">
            <span
              className="h-1.5 w-1.5 rounded-full bg-cyan-primary"
              aria-hidden="true"
            />
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] hud-border bg-background/60 text-foreground/90">
          <span className="text-cyan-primary font-medium tabular-nums">
            {totalRooms}
          </span>
          <span>{totalRooms === 1 ? "Room" : "Rooms"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] hud-border bg-background/60 text-foreground/90">
          <span className="text-cyan-primary font-medium tabular-nums">
            {desiredOnCount}/{totalDevices}
          </span>
          <span>Desired ON</span>
        </span>
        <span className="text-[11px] text-muted">{syncNote}</span>
      </div>
    </section>
  );
}
