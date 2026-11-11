"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Lightbulb, Fan, Sparkles, Moon, Power } from "lucide-react";
import { prefersReducedMotion, supportsHover } from "@/lib/motion";

const DEVICE_ICONS = {
  light: Lightbulb,
  fan: Fan,
  led: Sparkles,
  night: Moon,
};

/**
 * Reusable smart room device control card with accessible toggle state
 * and GSAP hover, press, and state-change micro-interactions.
 */
export default function DeviceCard({
  name,
  iconKey = "light",
  defaultOn = false,
  isOn: controlledOn,
  onToggle,
}) {
  const [localOn, setLocalOn] = useState(defaultOn);
  const isActive = controlledOn !== undefined ? controlledOn : localOn;

  const cardRef = useRef(null);
  const iconBadgeRef = useRef(null);
  const statusDotRef = useRef(null);
  const hasMountedRef = useRef(false);

  const Icon = DEVICE_ICONS[iconKey] ?? Power;

  // Animation 5: Smooth state transition feedback on toggle
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
        { scale: 1, opacity: 1, duration: 0.25, ease: "power2.out", clearProps: "transform,opacity" }
      );
    }, cardRef);

    return () => ctx.revert();
  }, [isActive]);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
      return;
    }
    setLocalOn((prev) => !prev);
  };

  const handleMouseEnter = () => {
    if (prefersReducedMotion() || !supportsHover()) return;
    gsap.to(cardRef.current, {
      y: -2,
      duration: 0.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handleMouseLeave = () => {
    if (prefersReducedMotion() || !supportsHover()) return;
    gsap.to(cardRef.current, {
      y: 0,
      duration: 0.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handlePointerDown = () => {
    if (prefersReducedMotion()) return;
    gsap.to(cardRef.current, {
      scale: 0.975,
      duration: 0.12,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handlePointerRelease = () => {
    if (prefersReducedMotion()) return;
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
      onMouseLeave={() => {
        handleMouseLeave();
        handlePointerRelease();
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      style={
        isActive
          ? {
              background:
                "linear-gradient(145deg, rgba(0, 229, 255, 0.09) 0%, rgba(11, 18, 32, 0.98) 65%)",
            }
          : undefined
      }
      className={`min-h-[140px] sm:min-h-[148px] rounded-2xl p-4 flex flex-col justify-between gap-4 min-w-0 transition-[border-color,box-shadow,background-color] duration-200 ${
        isActive
          ? "hud-surface hud-border-active glow-cyan-sm"
          : "hud-surface border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          ref={iconBadgeRef}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
            isActive
              ? "bg-cyan-primary/15 text-cyan-primary hud-border-active"
              : "bg-white/5 text-muted border border-white/10"
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <button
          type="button"
          aria-pressed={isActive}
          aria-label={`${name}: ${isActive ? "ON" : "OFF"}. Tap to toggle.`}
          onClick={handleToggle}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
            isActive
              ? "bg-cyan-primary/25 border border-cyan-primary"
              : "bg-white/10 border border-white/15"
          }`}
        >
          <span
            className={`inline-block h-5.5 w-5.5 rounded-full transition-transform duration-200 ${
              isActive
                ? "translate-x-6 bg-cyan-primary shadow-[0_0_8px_rgba(0,229,255,0.65)]"
                : "translate-x-0 bg-muted"
            }`}
          />
        </button>
      </div>

      <div className="min-w-0 space-y-1.5">
        <h3 className="font-display text-sm font-semibold tracking-wide text-foreground truncate">
          {name}
        </h3>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 font-medium uppercase tracking-wider ${
              isActive ? "text-cyan-primary" : "text-muted"
            }`}
          >
            <span
              ref={statusDotRef}
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? "bg-cyan-primary" : "bg-muted/60"
              }`}
              aria-hidden="true"
            />
            {isActive ? "ON" : "OFF"}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted/80">
            Mock
          </span>
        </div>
      </div>
    </article>
  );
}
