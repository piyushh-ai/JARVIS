import { connectDB } from "@/lib/db/connect";
import Home from "@/models/Home";
import Session from "@/models/Session";
import User from "@/models/User";
import { ServiceError } from "@/lib/utils/apiResponse";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  getUserHomesSummary,
  revokeSession,
  updateSessionCurrentHome,
} from "@/lib/auth/session";
import { requireHomeAccess, requireHomeRole } from "@/lib/auth/guards";
import {
  assertValidObjectId,
  validateAddHomeMemberPayload,
  validateCreateHomePayload,
  validateLoginPayload,
  validateRegisterPayload,
  validateSwitchHomePayload,
  validateUpdateHomeMemberRolePayload,
} from "@/lib/utils/validation";

// Precomputed valid scrypt format string used to equalize timing when email does not exist.
const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$00000000000000000000000000000000$${"0".repeat(128)}`;

function buildDefaultHomeName(userName) {
  const firstToken = String(userName || "").trim().split(/\s+/)[0] || "My";
  const candidate = `${firstToken}'s Home`;
  return candidate.length <= 80 ? candidate : "My Home";
}

function sanitizeUserDoc(user, currentHomeId = null) {
  return {
    _id: String(user._id),
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    currentHomeId: currentHomeId ? String(currentHomeId) : null,
  };
}

export async function registerUserWithDefaultHome(payload) {
  const data = validateRegisterPayload(payload);
  await connectDB();

  const existing = await User.exists({ email: data.email });
  if (existing) {
    throw new ServiceError(
      "Unable to complete registration with the provided credentials",
      409
    );
  }

  const passwordHash = await hashPassword(data.password);
  const createdUser = await User.create({
    name: data.name,
    email: data.email,
    passwordHash,
    role: "member",
    status: "active",
  });

  let createdHome;
  try {
    createdHome = await Home.create({
      name: data.homeName || buildDefaultHomeName(data.name),
      ownerId: createdUser._id,
      members: [{ userId: createdUser._id, role: "owner" }],
    });

    await User.updateOne(
      { _id: createdUser._id },
      { $set: { currentHomeId: createdHome._id } }
    );
  } catch (err) {
    await User.findByIdAndDelete(createdUser._id).catch(() => {});
    throw err;
  }

  const { rawToken, expiresAt } = await createSession(createdUser._id, {
    currentHomeId: createdHome._id,
  });

  const homes = await getUserHomesSummary(createdUser._id);
  const currentHome = homes[0] || null;

  return {
    user: sanitizeUserDoc(createdUser, createdHome._id),
    homes,
    currentHome,
    rawToken,
    expiresAt,
  };
}

export async function loginUser(payload) {
  const data = validateLoginPayload(payload);
  await connectDB();

  const user = await User.findOne({ email: data.email })
    .select("+passwordHash")
    .lean();

  if (!user || !user.passwordHash) {
    await verifyPassword(data.password, DUMMY_PASSWORD_HASH);
    throw new ServiceError("Invalid email or password", 401);
  }

  const passwordValid = await verifyPassword(data.password, user.passwordHash);
  if (!passwordValid) {
    throw new ServiceError("Invalid email or password", 401);
  }

  if (user.status !== "active") {
    throw new ServiceError("This account is suspended", 403);
  }

  const homes = await getUserHomesSummary(user._id);
  const currentHome =
    homes.find((home) => String(home._id) === String(user.currentHomeId)) ||
    homes[0] ||
    null;

  const { rawToken, expiresAt } = await createSession(user._id, {
    currentHomeId: currentHome ? currentHome._id : null,
  });

  return {
    user: sanitizeUserDoc(user, currentHome ? currentHome._id : null),
    homes,
    currentHome,
    rawToken,
    expiresAt,
  };
}

export async function logoutByToken(rawToken) {
  return revokeSession(rawToken);
}

export async function createHome({ userId, rawToken, payload }) {
  const data = validateCreateHomePayload(payload);
  await connectDB();

  const home = await Home.create({
    name: data.name,
    ownerId: userId,
    members: [{ userId, role: "owner" }],
  });

  await Promise.all([
    User.updateOne({ _id: userId }, { $set: { currentHomeId: home._id } }),
    rawToken ? updateSessionCurrentHome(rawToken, home._id) : Promise.resolve(),
  ]);

  const homes = await getUserHomesSummary(userId);
  const currentHome = homes.find((h) => h._id === String(home._id)) || null;

  return {
    home: currentHome,
    homes,
    currentHome,
  };
}

export async function switchCurrentHome({ userId, rawToken, payload }) {
  const { homeId } = validateSwitchHomePayload(payload);
  await connectDB();

  const home = await Home.findOne({
    _id: homeId,
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  }).lean();

  if (!home) {
    throw new ServiceError("You do not have access to this home", 403);
  }

  await Promise.all([
    User.updateOne({ _id: userId }, { $set: { currentHomeId: home._id } }),
    rawToken ? updateSessionCurrentHome(rawToken, home._id) : Promise.resolve(),
  ]);

  const homes = await getUserHomesSummary(userId);
  const currentHome = homes.find((h) => h._id === String(home._id)) || null;

  return {
    homes,
    currentHome,
  };
}

async function formatHomeMembers(homeDoc) {
  const memberIds = new Set([
    String(homeDoc.ownerId),
    ...(homeDoc.members || []).map((m) => String(m.userId)),
  ]);

  const users = await User.find({ _id: { $in: Array.from(memberIds) } })
    .select("name email status")
    .lean();
  const usersById = new Map(users.map((u) => [String(u._id), u]));

  const formatted = [];
  for (const m of homeDoc.members || []) {
    const uid = String(m.userId);
    const u = usersById.get(uid);
    if (!u) continue;
    formatted.push({
      userId: uid,
      name: u.name,
      email: u.email,
      status: u.status,
      role: uid === String(homeDoc.ownerId) ? "owner" : m.role,
      joinedAt: m.joinedAt,
    });
  }

  if (!formatted.some((m) => m.userId === String(homeDoc.ownerId))) {
    const owner = usersById.get(String(homeDoc.ownerId));
    if (owner) {
      formatted.unshift({
        userId: String(owner._id),
        name: owner.name,
        email: owner.email,
        status: owner.status,
        role: "owner",
        joinedAt: homeDoc.createdAt,
      });
    }
  }

  return formatted;
}

export async function getHomeMembers(homeId, auth) {
  requireHomeAccess(homeId, auth);
  await connectDB();

  const home = await Home.findById(homeId).lean();
  if (!home) {
    throw new ServiceError("Home not found", 404);
  }

  return formatHomeMembers(home);
}

export async function addHomeMember({ homeId, payload, auth }) {
  const access = requireHomeAccess(homeId, auth);
  requireHomeRole(access, ["owner", "admin"]);

  const { email, role } = validateAddHomeMemberPayload(payload);
  if (role === "admin" && access.role !== "owner") {
    throw new ServiceError("Only the home owner can assign admin roles", 403);
  }

  await connectDB();
  const [home, targetUser] = await Promise.all([
    Home.findById(homeId),
    User.findOne({ email, status: "active" }).lean(),
  ]);

  if (!home) {
    throw new ServiceError("Home not found", 404);
  }
  if (!targetUser) {
    throw new ServiceError("No active user found with that email", 404);
  }

  const alreadyMember =
    String(home.ownerId) === String(targetUser._id) ||
    (home.members || []).some((m) => String(m.userId) === String(targetUser._id));
  if (alreadyMember) {
    throw new ServiceError("User is already a member of this home", 409);
  }

  home.members.push({ userId: targetUser._id, role });
  await home.save();

  if (!targetUser.currentHomeId) {
    await User.updateOne(
      { _id: targetUser._id },
      { $set: { currentHomeId: home._id } }
    );
  }

  return formatHomeMembers(home.toObject());
}

export async function updateHomeMemberRole({
  homeId,
  targetUserId,
  payload,
  auth,
}) {
  assertValidObjectId(targetUserId, "member ID");
  const access = requireHomeAccess(homeId, auth);
  requireHomeRole(access, ["owner"]);

  if (String(targetUserId) === String(auth.user._id)) {
    throw new ServiceError("Home owner cannot alter their own role", 400);
  }

  const { role } = validateUpdateHomeMemberRolePayload(payload);
  await connectDB();

  const home = await Home.findById(homeId);
  if (!home) {
    throw new ServiceError("Home not found", 404);
  }
  if (String(home.ownerId) === String(targetUserId)) {
    throw new ServiceError("Cannot alter the home owner's role", 400);
  }

  const member = (home.members || []).find(
    (m) => String(m.userId) === String(targetUserId)
  );
  if (!member) {
    throw new ServiceError("Member not found in this home", 404);
  }

  member.role = role;
  await home.save();

  return formatHomeMembers(home.toObject());
}

export async function removeHomeMember({ homeId, targetUserId, auth }) {
  assertValidObjectId(targetUserId, "member ID");
  const access = requireHomeAccess(homeId, auth);
  requireHomeRole(access, ["owner", "admin"]);

  if (String(targetUserId) === String(auth.user._id)) {
    throw new ServiceError("Cannot remove yourself from the home", 400);
  }

  await connectDB();
  const home = await Home.findById(homeId);
  if (!home) {
    throw new ServiceError("Home not found", 404);
  }

  if (String(home.ownerId) === String(targetUserId)) {
    throw new ServiceError("Cannot remove the home owner", 400);
  }

  const member = (home.members || []).find(
    (m) => String(m.userId) === String(targetUserId)
  );
  if (!member) {
    throw new ServiceError("Member not found in this home", 404);
  }

  if (member.role === "admin" && access.role !== "owner") {
    throw new ServiceError("Only the home owner can remove an admin", 403);
  }

  home.members = home.members.filter(
    (m) => String(m.userId) !== String(targetUserId)
  );
  await home.save();

  const fallbackHome = await Home.findOne({
    _id: { $ne: home._id },
    $or: [{ ownerId: targetUserId }, { "members.userId": targetUserId }],
  })
    .select("_id")
    .lean();

  await Promise.all([
    User.updateOne(
      { _id: targetUserId, currentHomeId: home._id },
      { $set: { currentHomeId: fallbackHome?._id || null } }
    ),
    Session.updateMany(
      { userId: targetUserId, currentHomeId: home._id, revokedAt: null },
      { $set: { currentHomeId: fallbackHome?._id || null } }
    ),
  ]);

  return formatHomeMembers(home.toObject());
}

