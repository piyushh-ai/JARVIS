"use client";

import Link from "next/link";
import { Home, Sparkles, Zap, Settings } from "lucide-react";

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home, href: "/", active: true },
  { id: "assistant", label: "Assistant", icon: Sparkles, active: false },
  { id: "automation", label: "Automation", icon: Zap, active: false },
  { id: "settings", label: "Settings", icon: Settings, active: false },
];

/**
 * Fixed mobile bottom navigation with safe-area padding and floating dock layout on larger viewports.
 * Only Home is active; future destinations render as accessible disabled placeholders.
 */
export default function BottomNav() {
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 hud-surface-elevated border-x-0 border-b-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:inset-x-auto md:left-1/2 md:bottom-5 md:-translate-x-1/2 md:w-full md:max-w-md md:rounded-2xl md:hud-border-active md:glow-cyan-sm md:pb-0"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-1.5 md:px-3 md:py-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon, href, active }) => (
          <li key={id} className="min-w-0">
            {active ? (
              <Link
                href={href}
                aria-current="page"
                className="flex min-h-[48px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 sm:px-2 py-1.5 text-[11px] font-medium text-cyan-primary bg-cyan-primary/12 hud-border-active transition-colors"
              >
                <Icon className="h-4 w-4 text-cyan-primary" aria-hidden="true" />
                <span className="truncate tracking-wide">{label}</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                aria-label={`${label} (coming soon)`}
                title={`${label} (coming soon)`}
                className="flex min-h-[48px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 sm:px-2 py-1.5 text-[11px] font-medium text-muted/85 border border-transparent select-none cursor-not-allowed"
              >
                <Icon className="h-4 w-4 opacity-75" aria-hidden="true" />
                <span className="truncate tracking-wide">{label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
