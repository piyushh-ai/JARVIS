import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/utils/apiResponse";
import { getCurrentUser } from "@/lib/auth/session";
import { assertValidObjectId } from "@/lib/utils/validation";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DISALLOWED_FORM_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
];

function extractExpectedHost(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || "";
  return host.split(",")[0].trim().toLowerCase();
}

function parseUrlHost(rawUrl) {
  try {
    return new URL(rawUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Enforces same-origin protections for cookie-authenticated state-changing requests.
 */
export function assertSameOrigin(request) {
  if (!request) return;

  const method = (request.method || "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return;

  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    throw new ServiceError("Cross-site state-changing requests are forbidden", 403);
  }

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (DISALLOWED_FORM_TYPES.some((type) => contentType.includes(type))) {
    throw new ServiceError("Unsupported content-type for JSON API endpoint", 403);
  }

  const expectedHost = extractExpectedHost(request);
  const origin = request.headers.get("origin");
  if (origin !== null) {
    if (origin === "null") {
      throw new ServiceError("Null request origin is forbidden", 403);
    }
    const originHost = parseUrlHost(origin);
    if (!originHost || (expectedHost && originHost !== expectedHost)) {
      throw new ServiceError("Request origin mismatch", 403);
    }
    return;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const refererHost = parseUrlHost(referer);
    if (!refererHost || (expectedHost && refererHost !== expectedHost)) {
      throw new ServiceError("Request referer mismatch", 403);
    }
  }
}

/**
 * Ensures an active authenticated user session exists via HTTP-only session cookie.
 */
export async function requireAuth(request = null, { requireCsrf = true } = {}) {
  if (requireCsrf && request) {
    assertSameOrigin(request);
  }

  const auth = await getCurrentUser();
  if (!auth) {
    throw new ServiceError("Authentication required", 401);
  }

  return auth;
}

/**
 * Resolves the target Home from requestedHomeId (URL/body) or the user's active Home
 * and verifies that the authenticated user belongs to it (403 on cross-home access).
 */
export function resolveAuthorizedHome(auth, requestedHomeId = null) {
  if (!auth || !Array.isArray(auth.homes)) {
    throw new ServiceError("Authentication required", 401);
  }

  if (requestedHomeId !== null && requestedHomeId !== undefined && requestedHomeId !== "") {
    assertValidObjectId(requestedHomeId, "homeId");
    const matched = auth.homes.find(
      (home) => String(home._id) === String(requestedHomeId)
    );
    if (!matched) {
      throw new ServiceError("You do not have access to this home", 403);
    }
    return matched;
  }

  if (!auth.currentHome) {
    throw new ServiceError("No authorized home is active for this account", 403);
  }

  return auth.currentHome;
}

/**
 * Verifies user membership on an explicit homeId.
 */
export function requireHomeAccess(homeId, auth) {
  return resolveAuthorizedHome(auth, homeId);
}

/**
 * Verifies the user's role within the authorized Home against allowedRoles.
 */
export function requireHomeRole(home, allowedRoles = []) {
  if (!home || !allowedRoles.includes(home.role)) {
    throw new ServiceError(
      "You do not have permission to perform this action in this home",
      403
    );
  }
  return home;
}

/**
 * Helper to apply Cache-Control: no-store headers on sensitive auth responses.
 */
export function withNoStore(response) {
  if (response instanceof NextResponse) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  return response;
}

