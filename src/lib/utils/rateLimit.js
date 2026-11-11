import { ServiceError } from "@/lib/utils/apiResponse";

const globalForRateLimit = globalThis;

if (!globalForRateLimit._jarvisRateLimitStore) {
  globalForRateLimit._jarvisRateLimitStore = new Map();
}

const store = globalForRateLimit._jarvisRateLimitStore;
const MAX_STORE_ENTRIES = 2000;

function pruneExpiredBuckets(now) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

/**
 * Extracts best-effort client IP from reverse-proxy / Vercel headers.
 */
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Serverless-safe per-instance sliding/fixed-window rate limiter without
 * background intervals or local disk dependencies.
 * Throws ServiceError (429) if the caller exceeds maxRequests within windowMs.
 */
export function enforceRateLimit(
  bucketKey,
  { maxRequests = 60, windowMs = 60000 } = {}
) {
  const now = Date.now();

  if (store.size > MAX_STORE_ENTRIES) {
    pruneExpiredBuckets(now);
  }

  const existing = store.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    store.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  existing.count += 1;
  if (existing.count > maxRequests) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    );
    const err = new ServiceError(
      `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
      429
    );
    err.retryAfterSeconds = retryAfterSec;
    throw err;
  }
}

/**
 * Test helper to clear in-memory rate-limit buckets cleanly.
 */
export function resetRateLimitStore() {
  store.clear();
}

