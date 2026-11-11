import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeReturnUrl } from "@/lib/auth/session";
import AuthFormView from "@/features/auth/AuthFormView";

async function RegisterGate({ searchParamsPromise }) {
  const [auth, resolvedParams] = await Promise.all([
    getCurrentUser(),
    searchParamsPromise,
  ]);
  const safeNext = sanitizeReturnUrl(resolvedParams?.next);

  if (auth) {
    redirect(safeNext);
  }

  return <AuthFormView mode="register" nextUrl={safeNext} />;
}

function RegisterBootFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-hud-grid text-cyan-primary font-display text-xs tracking-[0.2em] uppercase">
      Preparing Registration...
    </div>
  );
}

export default function RegisterPage({ searchParams }) {
  return (
    <Suspense fallback={<RegisterBootFallback />}>
      <RegisterGate searchParamsPromise={searchParams} />
    </Suspense>
  );
}

