import { Cpu, User, Wifi, WifiOff } from "lucide-react";

/**
 * Compact mobile-first HUD header with JARVIS wordmark, system subtitle,
 * mock device connectivity indicator, and preview profile icon.
 */
export default function Header({
  isOnline = true,
  systemLabel = "SMART ROOM OS",
}) {
  return (
    <header
      data-gsap="header"
      className="sticky top-0 z-30 hud-surface-elevated border-x-0 border-t-0"
    >
      <div className="hud-container flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-3">
        {/* Left: Emblem + Wordmark */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div
            className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl hud-border-active glow-cyan-sm"
            style={{
              background:
                "linear-gradient(145deg, rgba(0, 229, 255, 0.14), rgba(22, 119, 255, 0.08))",
            }}
            aria-hidden="true"
          >
            <Cpu className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-primary" />
          </div>

          <div className="min-w-0">
            <h1 className="font-display text-sm sm:text-base font-semibold tracking-[0.2em] text-foreground glow-cyan-text truncate">
              JARVIS
            </h1>
            <p className="truncate text-[10px] uppercase tracking-[0.15em] text-muted">
              {systemLabel}
            </p>
          </div>
        </div>

        {/* Right: Connectivity indicator + Profile placeholder */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider hud-surface ${
              isOnline ? "hud-border-active text-cyan-primary" : "text-muted"
            }`}
            role="status"
            aria-label={`Connectivity: ${isOnline ? "Online (Demo)" : "Offline"}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isOnline
                  ? "bg-cyan-primary shadow-[0_0_6px_rgba(0,229,255,0.85)]"
                  : "bg-muted"
              }`}
              aria-hidden="true"
            />
            {isOnline ? (
              <Wifi className="h-3 w-3 text-cyan-primary" aria-hidden="true" />
            ) : (
              <WifiOff className="h-3 w-3 text-muted" aria-hidden="true" />
            )}
            <span>{isOnline ? "Online" : "Offline"}</span>
          </div>

          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-label="User profile preview (not yet active)"
            title="Profile (coming soon)"
            className="flex h-9 w-9 items-center justify-center rounded-xl hud-surface text-muted/75 opacity-80 cursor-not-allowed"
          >
            <User className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
