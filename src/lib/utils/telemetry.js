import { randomBytes } from "node:crypto";

const MAX_METRIC_SAMPLES = 40;
const globalForTelemetry = globalThis;

if (!globalForTelemetry._jarvisPerfStore) {
  globalForTelemetry._jarvisPerfStore = new Map();
}

const perfStore = globalForTelemetry._jarvisPerfStore;

export function createRequestId(request) {
  const incoming = request?.headers?.get?.("x-request-id")?.trim();
  if (incoming && /^[a-zA-Z0-9_-]{6,64}$/.test(incoming)) {
    return incoming;
  }
  return `req_${randomBytes(6).toString("hex")}`;
}

function recordSample(operation, entry) {
  let list = perfStore.get(operation);
  if (!list) {
    list = [];
    perfStore.set(operation, list);
  }
  list.push(entry);
  if (list.length > MAX_METRIC_SAMPLES) {
    list.shift();
  }
}

export function getRecordedPerformanceMetrics() {
  const summary = {};
  for (const [operation, samples] of perfStore.entries()) {
    const sorted = samples
      .map((s) => s.totalMs)
      .slice()
      .sort((a, b) => a - b);
    const count = sorted.length;
    const latest = samples[samples.length - 1] || null;
    const avgMs =
      count > 0
        ? Math.round((sorted.reduce((sum, v) => sum + v, 0) / count) * 10) / 10
        : 0;
    const p95Ms =
      count > 0 ? sorted[Math.min(count - 1, Math.floor(count * 0.95))] : 0;

    summary[operation] = {
      count,
      lastMs: latest?.totalMs ?? null,
      avgMs,
      p95Ms,
      lastTimings: latest?.timings ?? null,
      lastAt: latest?.at ?? null,
    };
  }
  return summary;
}

export function createTimer(operation, requestId) {
  const start = performance.now();
  const marks = {};
  let lastMark = start;

  return {
    requestId,
    mark(stageName) {
      const now = performance.now();
      marks[stageName] = Math.round((now - lastMark) * 10) / 10;
      lastMark = now;
    },
    finish({ status = 200, commandId = null, esp32DeviceId = null, extra = null } = {}) {
      const totalMs = Math.round((performance.now() - start) * 10) / 10;
      const timings = { ...marks, totalMs };

      recordSample(operation, {
        at: new Date().toISOString(),
        requestId,
        status,
        totalMs,
        timings,
      });

      const logPayload = {
        level: status >= 500 ? "error" : "info",
        event: "jarvis_api_perf",
        operation,
        requestId,
        status,
        ...(commandId ? { commandId } : {}),
        ...(esp32DeviceId ? { esp32DeviceId } : {}),
        timings,
        ...(extra ? extra : {}),
      };

      if (process.env.JARVIS_PERF_LOGS !== "0") {
        console.info(JSON.stringify(logPayload));
      }

      return timings;
    },
  };
}

export function applyTelemetryHeaders(response, requestId, timings) {
  if (!response?.headers) return response;
  if (requestId) {
    response.headers.set("X-Request-Id", requestId);
  }
  if (timings && typeof timings === "object") {
    const parts = Object.entries(timings)
      .filter(([, val]) => typeof val === "number" && Number.isFinite(val))
      .map(([key, val]) => `${key.replace(/[^a-zA-Z0-9_-]/g, "")};dur=${val}`);
    if (parts.length > 0) {
      response.headers.set("Server-Timing", parts.join(", "));
    }
  }
  return response;
}

