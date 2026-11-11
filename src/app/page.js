import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import DashboardClient from "@/features/dashboard/DashboardClient";

async function ProtectedDashboard() {
  const auth = await getCurrentUser();
  if (!auth) {
    redirect("/login?next=%2F");
  }

  return (
    <DashboardClient
      initialAuth={{
        user: auth.user,
        homes: auth.homes,
        currentHome: auth.currentHome,
      }}
    />
  );
}

function DashboardBootFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-hud-grid text-cyan-primary font-display text-xs tracking-[0.2em] uppercase">
      Initializing JARVIS Session...
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardBootFallback />}>
      <ProtectedDashboard />
    </Suspense>
  );
}
