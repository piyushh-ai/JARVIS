"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import {
  AlertCircle,
  ArrowRight,
  Cpu,
  Eye,
  EyeOff,
  Home,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { loginAccount, registerAccount } from "@/services/authApi";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Shared futuristic JARVIS HUD authentication view for /login and /register.
 */
export default function AuthFormView({ mode = "login", nextUrl = "/" }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const containerRef = useRef(null);

  const [name, setName] = useState("");
  const [homeName, setHomeName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;

    const ctx = gsap.context(() => {
      gsap.from('[data-gsap="auth-card"]', {
        y: 16,
        opacity: 0,
        duration: 0.45,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please fill in your email and password.");
      return;
    }

    if (isRegister) {
      if (name.trim().length < 2) {
        setError("Name must be at least 2 characters.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isRegister) {
        await registerAccount({
          name: name.trim(),
          email: trimmedEmail,
          password,
          ...(homeName.trim() ? { homeName: homeName.trim() } : {}),
        });
      } else {
        await loginAccount({
          email: trimmedEmail,
          password,
        });
      }

      const target =
        typeof nextUrl === "string" &&
        nextUrl.startsWith("/") &&
        !nextUrl.startsWith("//")
          ? nextUrl
          : "/";

      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const altHref =
    nextUrl && nextUrl !== "/"
      ? `/${isRegister ? "login" : "register"}?next=${encodeURIComponent(nextUrl)}`
      : `/${isRegister ? "login" : "register"}`;

  return (
    <div
      ref={containerRef}
      className="min-h-dvh flex items-center justify-center bg-hud-grid px-4 py-8 sm:px-6"
    >
      <div
        data-gsap="auth-card"
        className="w-full max-w-md rounded-2xl hud-surface-elevated hud-border-active p-6 sm:p-8 glow-cyan-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hud-border-active glow-cyan-sm"
            style={{
              background:
                "linear-gradient(145deg, rgba(0, 229, 255, 0.16), rgba(22, 119, 255, 0.1))",
            }}
            aria-hidden="true"
          >
            <Cpu className="h-5 w-5 text-cyan-primary" />
          </div>
          <div>
            <p className="font-display text-xs tracking-[0.22em] text-cyan-primary uppercase glow-cyan-text">
              JARVIS HOME OS
            </p>
            <h1 className="font-display text-lg sm:text-xl font-semibold tracking-wider text-foreground">
              {isRegister ? "INITIALIZE OPERATOR" : "OPERATOR ACCESS"}
            </h1>
          </div>
        </div>

        <p className="mb-6 text-xs sm:text-sm text-muted">
          {isRegister
            ? "Create your encrypted JARVIS account and personal smart home workspace."
            : "Authenticate with your JARVIS credentials to access your homes and devices."}
        </p>

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {isRegister && (
            <>
              <div>
                <label
                  htmlFor="auth-name"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tony Stark"
                    className="w-full rounded-xl border border-cyan-primary/20 bg-surface-dark/75 py-2.5 pl-10 pr-3.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-home-name"
                  className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted"
                >
                  <span>Home Name</span>
                  <span className="text-[10px] font-normal text-muted/80">
                    Optional
                  </span>
                </label>
                <div className="relative">
                  <Home
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-home-name"
                    name="homeName"
                    type="text"
                    maxLength={80}
                    value={homeName}
                    onChange={(e) => setHomeName(e.target.value)}
                    placeholder="Stark Malibu Residence"
                    className="w-full rounded-xl border border-cyan-primary/20 bg-surface-dark/75 py-2.5 pl-10 pr-3.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@jarvis.home"
                className="w-full rounded-xl border border-cyan-primary/20 bg-surface-dark/75 py-2.5 pl-10 pr-3.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted"
            >
              <span>Password</span>
              {isRegister && (
                <span className="text-[10px] font-normal text-muted/80">
                  Min 8 characters
                </span>
              )}
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 8 : 1}
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-cyan-primary/20 bg-surface-dark/75 py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted hover:text-cyan-primary cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl hud-border-active bg-cyan-primary/15 px-4 py-2.5 font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-cyan-primary transition hover:bg-cyan-primary/25 glow-cyan-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>
                  {isRegister ? "Initializing Home..." : "Authenticating..."}
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>{isRegister ? "Create Account" : "Sign In"}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-cyan-primary/15 pt-4 text-center text-xs text-muted">
          {isRegister ? (
            <>
              Already registered with JARVIS?{" "}
              <Link
                href={altHref}
                className="font-semibold text-cyan-primary hover:underline"
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to JARVIS?{" "}
              <Link
                href={altHref}
                className="font-semibold text-cyan-primary hover:underline"
              >
                Create an account
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

