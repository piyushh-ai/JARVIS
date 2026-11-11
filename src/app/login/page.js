import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeReturnUrl } from "@/lib/auth/session";
import AuthFormView from "@/features/auth/AuthFormView";

async function LoginGate({ searchParamsPromise }) {
  const [auth, resolvedParams] = await Promise.all([
    getCurrentUser(),
    searchParamsPromise,
  ]);
  const safeNext = sanitizeReturnUrl(resolvedParams?.next);

  if (auth) {
    redirect(safeNext);
  }

  return <AuthFormView mode="login" nextUrl={safeNext} />;
}

function LoginBootFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-hud-grid text-cyan-primary font-display text-xs tracking-[0.2em] uppercase">
      Loading JARVIS Access...
    </div>
  );
}

export default function LoginPage({ searchParams }) {
  return (
    <Suspense fallback={<LoginBootFallback />}>
      <LoginGate searchParamsPromise={searchParams} />
    </Suspense>
  );
}

