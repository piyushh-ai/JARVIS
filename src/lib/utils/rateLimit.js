import { connectDB } from "@/lib/db/connect";
import { ServiceError } from "@/lib/utils/apiResponse";
import RateLimit from "@/models/RateLimit";

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

async function incrementBucket(key, expiresAt) {
  try {
    return await RateLimit.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: false,
        projection: { count: 1 },
      }
    ).lean();
  } catch (error) {
    if (error?.code === 11000) {
      return RateLimit.findOneAndUpdate(
        { key },
        { $inc: { count: 1 } },
        { returnDocument: "after", projection: { count: 1 } }
      ).lean();
    }
    throw error;
  }
}

/**
 * Distributed MongoDB-backed fixed-window rate limiter safe across Vercel serverless instances.
 * Throws ServiceError (429) if the caller exceeds maxRequests within windowMs.
 */
export async function enforceRateLimit(
  bucketKey,
  { maxRequests = 60, windowMs = 60000 } = {}
) {
  await connectDB();

  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const windowKey = `${bucketKey}:${windowStart}`;
  const expiresAt = new Date(resetAt + 5000);

  const record = await incrementBucket(windowKey, expiresAt);
  if (record && record.count > maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
    const err = new ServiceError(
      `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
      429
    );
    err.retryAfterSeconds = retryAfterSec;
    throw err;
  }
}

/**
 * Test helper to clear persisted rate-limit buckets cleanly.
 */
export async function resetRateLimitStore(prefix = "") {
  await connectDB();
  if (!prefix) {
    await RateLimit.deleteMany({});
    return;
  }
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await RateLimit.deleteMany({ key: { $regex: `^${escaped}` } });
}
