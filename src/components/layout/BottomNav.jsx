"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Zap, Settings } from "lucide-react";

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home, href: "/", enabled: true },
  {
    id: "assistant",
    label: "Assistant",
    icon: Sparkles,
    href: "/assistant",
    enabled: true,
  },
  { id: "automation", label: "Automation", icon: Zap, enabled: false },
  { id: "settings", label: "Settings", icon: Settings, enabled: false },
];

/**
 * Fixed mobile bottom navigation with safe-area padding and floating dock layout on larger viewports.
 * Home and Assistant routes are live; Automation and Settings remain accessible placeholders.
 */
export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 hud-surface-elevated border-x-0 border-b-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:inset-x-auto md:left-1/2 md:bottom-5 md:-translate-x-1/2 md:w-full md:max-w-md md:rounded-2xl md:hud-border-active md:glow-cyan-sm md:pb-0"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-1.5 md:px-3 md:py-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon, href, enabled }) => {
          const isCurrent =
            enabled &&
            href &&
            (href === "/" ? pathname === "/" : pathname.startsWith(href));

          return (
            <li key={id} className="min-w-0">
              {enabled && href ? (
                <Link
                  href={href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex min-h-[48px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 sm:px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    isCurrent
                      ? "text-cyan-primary bg-cyan-primary/12 hud-border-active"
                      : "text-muted hover:text-foreground hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isCurrent ? "text-cyan-primary" : "text-muted"
                    }`}
                    aria-hidden="true"
                  />
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
          );
        })}
      </ul>
    </nav>
  );
}
