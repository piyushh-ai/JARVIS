import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AssistantClient from "@/features/assistant/AssistantClient";

async function ProtectedAssistant() {
  const auth = await getCurrentUser();
  if (!auth) {
    redirect("/login?next=%2Fassistant");
  }

  return (
    <AssistantClient
      initialAuth={{
        user: auth.user,
        homes: auth.homes,
        currentHome: auth.currentHome,
      }}
    />
  );
}

function AssistantBootFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-hud-grid text-cyan-primary font-display text-xs tracking-[0.2em] uppercase">
      Initializing JARVIS Neural Core...
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<AssistantBootFallback />}>
      <ProtectedAssistant />
    </Suspense>
  );
}

