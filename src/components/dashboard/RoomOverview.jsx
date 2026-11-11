import { Home, ShieldCheck } from "lucide-react";

/**
 * Compact room overview bar showing room name, device counts, and system state.
 */
export default function RoomOverview({
  roomName = "Smart Room 01",
  connectedDevices = 4,
  activeDevices = 0,
  systemStatus = "Nominal",
}) {
  return (
    <section
      aria-label="Room overview"
      data-gsap="room-overview"
      className="hud-surface rounded-2xl p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-primary/10 hud-border-active text-cyan-primary">
            <Home className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-semibold tracking-wider text-foreground truncate">
              {roomName}
            </h2>
            <p className="text-[11px] text-muted truncate">
              Local Demo Environment
            </p>
          </div>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider hud-border-active text-cyan-primary bg-cyan-primary/10">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {systemStatus}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-background/55 hud-border py-2.5 px-1 text-center">
        <div className="px-2 min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-muted truncate">
            Connected
          </dt>
          <dd className="mt-0.5 font-display text-sm sm:text-base font-semibold tabular-nums text-foreground">
            {connectedDevices}
          </dd>
        </div>

        <div className="px-2 min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-muted truncate">
            Active
          </dt>
          <dd className="mt-0.5 font-display text-sm sm:text-base font-semibold tabular-nums text-cyan-primary">
            {activeDevices}
          </dd>
        </div>

        <div className="px-2 min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-muted truncate">
            Status
          </dt>
          <dd className="mt-0.5 font-display text-sm sm:text-base font-semibold text-foreground truncate">
            {systemStatus}
          </dd>
        </div>
      </dl>
    </section>
  );
}
