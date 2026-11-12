"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  X,
} from "lucide-react";
import { UNUSABLE_OUTPUT_GPIO_PINS } from "@/lib/hardware/relayModules";

/**
 * Modal for owner/admin ESP32 controller registration (Relay Channel 1 initial test)
 * and secure one-time display/copy of generated bearer tokens.
 */
export default function ControllerProvisionModal({
  isOpen,
  submitting = false,
  oneTimeSecret = null,
  onClose,
  onClearSecret,
  onSubmit,
}) {
  const [name, setName] = useState("");
  const [esp32DeviceId, setEsp32DeviceId] = useState("");
  const [gpioPin, setGpioPin] = useState("");
  const [activeLevel, setActiveLevel] = useState("");
  const [validationError, setValidationError] = useState(null);

  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const isSecretView = Boolean(oneTimeSecret?.rawToken);

  useEffect(() => {
    if (!isOpen || isSecretView) return;
    const timer = setTimeout(() => {
      setName("");
      setEsp32DeviceId("");
      setGpioPin("");
      setActiveLevel("");
      setValidationError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, isSecretView]);

  useEffect(() => {
    if (!isSecretView) return undefined;
    const timer = setTimeout(() => {
      setShowToken(false);
      setCopiedToken(false);
      setCopiedId(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [isSecretView, oneTimeSecret?.rawToken]);

  useEffect(() => {
    if (!isOpen || isSecretView) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSecretView, submitting, onClose]);

  if (!isOpen && !isSecretView) return null;

  const handleCopyText = async (value, type) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (type === "token") {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2500);
      } else {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2500);
      }
    } catch {
      setValidationError(
        "Clipboard access unavailable. Reveal and copy the token manually."
      );
    }
  };

  const handleProvisionSubmit = async (event) => {
    event.preventDefault();
    setValidationError(null);

    const trimmedId = esp32DeviceId.trim();
    if (!trimmedId) {
      setValidationError("Unique ESP32 Device ID is required.");
      return;
    }
    if (trimmedId.length > 100) {
      setValidationError("ESP32 Device ID cannot exceed 100 characters.");
      return;
    }

    let parsedGpio = null;
    if (gpioPin.trim() !== "") {
      const n = Number(gpioPin);
      if (!Number.isInteger(n) || n < 0 || n > 39) {
        setValidationError("GPIO pin must be a whole integer between 0 and 39.");
        return;
      }
      if (UNUSABLE_OUTPUT_GPIO_PINS.has(n)) {
        setValidationError(
          `GPIO ${n} cannot be driven as a relay output (SPI flash 6-11 or input-only 34-39).`
        );
        return;
      }
      parsedGpio = n;
    }

    const payload = {
      name: name.trim(),
      esp32DeviceId: trimmedId,
      relayConfig: [
        {
          relayNumber: 1,
          gpioPin: parsedGpio,
          activeLevel: activeLevel || null,
          safeBootState: "off",
        },
      ],
    };

    try {
      await onSubmit?.(payload);
    } catch (err) {
      setValidationError(err?.message || "Failed to provision ESP32 controller.");
    }
  };

  const handleDismissSecret = () => {
    setShowToken(false);
    setCopiedToken(false);
    setCopiedId(false);
    onClearSecret?.();
    onClose?.();
  };

  const rawToken = oneTimeSecret?.rawToken || "";
  const maskedToken = rawToken
    ? `${rawToken.slice(0, 12)}${"•".repeat(Math.max(8, rawToken.length - 12))}`
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="controller-modal-title"
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          !submitting &&
          !isSecretView
        ) {
          onClose?.();
        }
      }}
    >
      <div className="hud-surface-elevated hud-border-active glow-cyan-sm w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 border-b hud-divider pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <KeyRound
              className="h-4 w-4 text-cyan-primary shrink-0"
              aria-hidden="true"
            />
            <h2
              id="controller-modal-title"
              className="font-display text-sm sm:text-base font-semibold tracking-wider text-foreground uppercase truncate"
            >
              {isSecretView
                ? oneTimeSecret.mode === "rotate"
                  ? "New Controller Token Issued"
                  : "ESP32 Provisioned · Save Token"
                : "Provision ESP32 Controller"}
            </h2>
          </div>

          {!isSecretView && (
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              aria-label="Close controller provisioning modal"
              className="flex h-9 w-9 items-center justify-center rounded-xl hud-surface text-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {isSecretView ? (
          <div className="mt-4 space-y-4">
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-amber-400/45 bg-amber-500/12 px-3.5 py-3 text-xs text-amber-100"
            >
              <ShieldAlert
                className="h-4 w-4 text-amber-300 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold uppercase tracking-wider text-amber-200">
                  One-Time Credential Reveal
                </p>
                <p className="mt-1 leading-relaxed text-amber-100/90">
                  Store this bearer token in your ESP32 NVS Flash now. JARVIS
                  hashes credentials server-side and cannot retrieve or display
                  this raw token again after you close this panel.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl bg-background/65 hud-border p-3.5">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                  ESP32 Device ID (X-Device-Id)
                </span>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-dark/90 hud-border px-3 py-2">
                  <code className="text-xs text-foreground truncate font-mono">
                    {oneTimeSecret.controller?.esp32DeviceId}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        oneTimeSecret.controller?.esp32DeviceId,
                        "id"
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md hud-surface px-2 py-1 text-[11px] text-cyan-primary hover:hud-border-active cursor-pointer shrink-0"
                  >
                    {copiedId ? (
                      <>
                        <Check className="h-3 w-3" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        <span>Copy ID</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                  Bearer Token (Authorization: Bearer &lt;token&gt;)
                </span>
                <div className="flex items-center gap-2 rounded-lg bg-surface-dark/90 hud-border-active px-3 py-2.5">
                  <code className="flex-1 min-w-0 break-all text-xs text-cyan-primary font-mono select-all">
                    {showToken ? rawToken : maskedToken}
                  </code>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowToken((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-xl hud-surface px-3 py-1.5 text-xs text-foreground hover:text-cyan-primary hover:hud-border-active cursor-pointer"
                  >
                    {showToken ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Hide Token</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Reveal Token</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyText(rawToken, "token")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-primary/20 hud-border-active px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/30 cursor-pointer"
                  >
                    {copiedToken ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Token Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copy Token</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {validationError && (
              <p className="text-xs text-red-300" role="alert">
                {validationError}
              </p>
            )}

            <div className="flex items-center justify-end border-t hud-divider pt-4">
              <button
                type="button"
                onClick={handleDismissSecret}
                className="rounded-xl bg-cyan-primary/20 hud-border-active px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/30 cursor-pointer"
              >
                I&apos;ve Saved This Token · Close
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleProvisionSubmit}
            noValidate
            className="mt-4 space-y-4"
          >
            {validationError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-200"
              >
                <AlertTriangle
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>{validationError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="ctrl-name"
                className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
              >
                Controller Name
              </label>
              <input
                id="ctrl-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Living Room ESP32"
                maxLength={80}
                className="w-full rounded-xl bg-background/80 hud-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="ctrl-esp-id"
                className="block text-xs font-medium uppercase tracking-wider text-muted mb-1.5"
              >
                Unique ESP32 Device ID *
              </label>
              <input
                id="ctrl-esp-id"
                type="text"
                value={esp32DeviceId}
                onChange={(e) => setEsp32DeviceId(e.target.value)}
                placeholder="e.g. esp32-room-01"
                maxLength={100}
                required
                className="w-full rounded-xl bg-background/80 hud-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
              />
            </div>

            <div className="rounded-xl bg-background/55 hud-border p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-primary">
                  Relay Channel 1 Configuration
                </span>
                <span className="rounded-full bg-cyan-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted border border-cyan-primary/20">
                  Single-Channel Initial Test
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="ctrl-gpio-1"
                    className="block text-[11px] font-medium uppercase tracking-wider text-muted mb-1"
                  >
                    Verified GPIO Pin (Optional)
                  </label>
                  <input
                    id="ctrl-gpio-1"
                    type="number"
                    min={0}
                    max={39}
                    step={1}
                    value={gpioPin}
                    onChange={(e) => setGpioPin(e.target.value)}
                    placeholder="Verified GPIO (e.g. 13 for Relay 1)"
                    className="w-full rounded-xl bg-background/80 hud-border px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-cyan-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ctrl-polarity-1"
                    className="block text-[11px] font-medium uppercase tracking-wider text-muted mb-1"
                  >
                    Trigger Polarity (Unassumed)
                  </label>
                  <select
                    id="ctrl-polarity-1"
                    value={activeLevel}
                    onChange={(e) => setActiveLevel(e.target.value)}
                    className="w-full rounded-xl bg-background/80 hud-border px-3 py-2 text-sm text-foreground focus:border-cyan-primary focus:outline-none"
                  >
                    <option value="">Unverified (Set after bench test)</option>
                    <option value="LOW">Active LOW</option>
                    <option value="HIGH">Active HIGH</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-muted">
                Bench-verified Relay #1 uses{" "}
                <span className="text-foreground">GPIO 13 · Active LOW</span> with{" "}
                <span className="text-foreground">safeBootState: off</span>.
                Dual 4-channel expansion (Module A CH 1–4, Module B CH 5–8) adds
                channels 2–8 only after per-channel bench verification (never drive SPI flash 6–11 or input-only 34–39).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t hud-divider pt-4">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="rounded-xl hud-surface px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-cyan-primary/20 hud-border-active px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-cyan-primary hover:bg-cyan-primary/30 cursor-pointer disabled:opacity-50"
              >
                {submitting ? "Provisioning..." : "Provision & Issue Token"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

