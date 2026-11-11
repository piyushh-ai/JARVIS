import { Cpu, User, Wifi, WifiOff, RefreshCw } from "lucide-react";

/**
 * Compact mobile-first HUD header displaying JARVIS branding and real backend sync state.
 */
export default function Header({
  status = "connected",
  systemLabel = "SMART ROOM OS",
  onRefresh,
  isRefreshing = false,
}) {
  const isConnected = status === "connected";
  const isSyncing = status === "syncing";

  const statusText = isSyncing
    ? "Syncing"
    : isConnected
      ? "API Ready"
      : "Offline";

  return (
    <header
      data-gsap="header"
      className="sticky top-0 z-30 hud-surface-elevated border-x-0 border-t-0"
    >
      <div className="hud-container flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-3">
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
            <h1 className="font-display text-sm sm:text-base font-semibold tracking-[0.18em] sm:tracking-[0.2em] text-foreground glow-cyan-text truncate">
              JARVIS
            </h1>
            <p className="truncate text-[10px] uppercase tracking-[0.11em] sm:tracking-[0.15em] text-muted">
              {systemLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider hud-surface ${
              isConnected
                ? "hud-border-active text-cyan-primary"
                : isSyncing
                  ? "border-blue-secondary/50 text-foreground"
                  : "border-red-400/40 text-red-300"
            }`}
            role="status"
            aria-label={`Backend status: ${statusText}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected
                  ? "bg-cyan-primary shadow-[0_0_6px_rgba(0,229,255,0.85)]"
                  : isSyncing
                    ? "bg-blue-secondary"
                    : "bg-red-400"
              }`}
              aria-hidden="true"
            />
            {isSyncing ? (
              <RefreshCw
                className="h-3 w-3 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : isConnected ? (
              <Wifi className="h-3 w-3 text-cyan-primary" aria-hidden="true" />
            ) : (
              <WifiOff className="h-3 w-3 text-red-300" aria-hidden="true" />
            )}
            <span>{statusText}</span>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh dashboard"
              title="Refresh dashboard data"
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl hud-surface text-muted hover:text-cyan-primary hover:hud-border-active cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isRefreshing ? "animate-spin motion-reduce:animate-none" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          )}

          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-label="User profile preview (authentication pending)"
            title="Profile (authentication pending)"
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl hud-surface text-muted cursor-not-allowed"
          >
            <User className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
