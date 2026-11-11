import crypto from "node:crypto";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/db/connect";
import Home from "@/models/Home";
import Session from "@/models/Session";
import User from "@/models/User";

export const SESSION_COOKIE_NAME = "jarvis_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_USED_TOUCH_INTERVAL_MS = 60 * 1000;

export function hashSessionToken(rawToken) {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) {
    return crypto.createHmac("sha256", secret).update(rawToken).digest("hex");
  }
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function getSessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function setSessionCookie(rawToken, expiresAt) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions(expiresAt));
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getRawSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
}

export async function createSession(
  userId,
  { currentHomeId = null, now = new Date() } = {}
) {
  await connectDB();

  const rawToken = generateRawSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session = await Session.create({
    userId,
    tokenHash,
    currentHomeId,
    expiresAt,
    lastUsedAt: now,
    revokedAt: null,
  });

  return {
    rawToken,
    expiresAt,
    session: session.toObject(),
  };
}

export async function updateSessionCurrentHome(rawToken, currentHomeId) {
  if (!rawToken || typeof rawToken !== "string") return false;
  await connectDB();
  const tokenHash = hashSessionToken(rawToken);
  const res = await Session.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { currentHomeId } }
  );
  return res.modifiedCount > 0;
}

export async function revokeSession(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return false;
  await connectDB();
  const tokenHash = hashSessionToken(rawToken);
  const res = await Session.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function revokeAllUserSessions(userId) {
  await connectDB();
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

export async function getUserHomesSummary(userId) {
  const homes = await Home.find({
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  })
    .sort({ createdAt: 1 })
    .lean();

  return homes.map((home) => {
    const membership = (home.members || []).find(
      (m) => String(m.userId) === String(userId)
    );
    const role =
      String(home.ownerId) === String(userId)
        ? "owner"
        : membership?.role || "member";
    return {
      _id: String(home._id),
      name: home.name,
      ownerId: String(home.ownerId),
      role,
      memberCount: (home.members || []).length,
    };
  });
}

/**
 * Resolves the currently authenticated user, verified DB session, and authorized Homes.
 * Returns null if the session cookie is missing, invalid, expired, revoked, or user is suspended.
 */
export async function getCurrentUser() {
  const rawToken = await getRawSessionToken();
  if (!rawToken || rawToken.length < 16 || rawToken.length > 256) {
    return null;
  }

  await connectDB();
  const now = new Date();
  const tokenHash = hashSessionToken(rawToken);

  const session = await Session.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).lean();

  if (!session) {
    return null;
  }

  const user = await User.findById(session.userId).lean();
  if (!user || user.status !== "active") {
    return null;
  }

  const homes = await getUserHomesSummary(user._id);
  const preferredHomeId = session.currentHomeId || user.currentHomeId;
  const currentHome =
    homes.find((home) => String(home._id) === String(preferredHomeId)) ||
    homes[0] ||
    null;

  const lastUsed = session.lastUsedAt
    ? new Date(session.lastUsedAt).getTime()
    : 0;
  if (now.getTime() - lastUsed > LAST_USED_TOUCH_INTERVAL_MS) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { lastUsedAt: now } }
    ).catch(() => {});
  }

  return {
    user: {
      _id: String(user._id),
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      currentHomeId: currentHome ? currentHome._id : null,
    },
    sessionId: String(session._id),
    rawToken,
    homes,
    currentHome,
  };
}

/**
 * Prevents open-redirect vulnerabilities by allowing only single-slash relative app paths.
 */
export function sanitizeReturnUrl(rawNext) {
  if (typeof rawNext !== "string") return "/";
  const trimmed = rawNext.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[\r\n\0]/.test(trimmed)
  ) {
    return "/";
  }
  return trimmed;
}

