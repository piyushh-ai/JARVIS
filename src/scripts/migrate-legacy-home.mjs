import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "../lib/db/connect.js";
import AutomationRule from "../models/AutomationRule.js";
import Command from "../models/Command.js";
import Controller from "../models/Controller.js";
import Conversation from "../models/Conversation.js";
import Device from "../models/Device.js";
import Home from "../models/Home.js";
import Room from "../models/Room.js";
import Session from "../models/Session.js";
import User from "../models/User.js";

const LEGACY_OWNER_ID = "000000000000000000000001";
const LEGACY_SCOPE_QUERY = {
  $or: [{ homeId: null }, { homeId: { $exists: false } }],
};

function loadLocalEnvFallback() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;

      const key = line.slice(0, eqIndex).trim();
      let val = line.slice(eqIndex + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  }
}

function parseCliArgs(argv) {
  const args = { email: "", homeId: "", dryRun: false };
  for (const token of argv) {
    if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token.startsWith("--email=")) {
      args.email = token.slice("--email=".length).trim().toLowerCase();
    } else if (token.startsWith("--home-id=")) {
      args.homeId = token.slice("--home-id=".length).trim();
    }
  }
  return args;
}

async function resolveTargetHome(user, requestedHomeId) {
  if (requestedHomeId) {
    if (!mongoose.isValidObjectId(requestedHomeId)) {
      throw new Error(`Invalid --home-id value: ${requestedHomeId}`);
    }
    const matched = await Home.findOne({
      _id: requestedHomeId,
      $or: [{ ownerId: user._id }, { "members.userId": user._id }],
    }).lean();
    if (!matched) {
      throw new Error(
        `User ${user.email} does not belong to home ${requestedHomeId}`
      );
    }
    return matched;
  }

  if (user.currentHomeId) {
    const current = await Home.findOne({
      _id: user.currentHomeId,
      $or: [{ ownerId: user._id }, { "members.userId": user._id }],
    }).lean();
    if (current) return current;
  }

  const owned = await Home.findOne({ ownerId: user._id })
    .sort({ createdAt: 1 })
    .lean();
  if (owned) return owned;

  throw new Error(
    `No Home found for ${user.email}. Register or create a Home before migrating.`
  );
}

async function run() {
  loadLocalEnvFallback();
  const { email, homeId: requestedHomeId, dryRun } = parseCliArgs(
    process.argv.slice(2)
  );

  if (!email) {
    console.error(
      "Usage: node src/scripts/migrate-legacy-home.mjs --email=<registered-email> [--home-id=<id>] [--dry-run]"
    );
    process.exitCode = 1;
    return;
  }

  await connectDB();

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.error(
      `Target user "${email}" was not found. Register this account via /register first.`
    );
    process.exitCode = 1;
    return;
  }

  const targetHome = await resolveTargetHome(user, requestedHomeId);

  const [legacyRooms, legacyDevicesCount, legacyCommandsCount, legacyControllersCount] =
    await Promise.all([
      Room.find(LEGACY_SCOPE_QUERY).lean(),
      Device.countDocuments(LEGACY_SCOPE_QUERY),
      Command.countDocuments(LEGACY_SCOPE_QUERY),
      Controller.countDocuments(LEGACY_SCOPE_QUERY),
    ]);

  console.log("=== JARVIS Legacy Data Migration Report ===");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY"}`);
  console.log(`Target User: ${user.name} <${user.email}> (${user._id})`);
  console.log(`Target Home: ${targetHome.name} (${targetHome._id})`);
  console.log(
    `Unscoped legacy records -> Rooms: ${legacyRooms.length}, Devices: ${legacyDevicesCount}, Commands: ${legacyCommandsCount}, Controllers: ${legacyControllersCount}`
  );

  if (dryRun) {
    return;
  }

  // Drop old unique ownerId+name index on rooms if present so multi-home rooms can reuse names
  const existingRoomIndexes = await Room.collection.indexes();
  const legacyRoomIdx = existingRoomIndexes.find(
    (idx) => idx.name === "ownerId_1_name_1" && idx.unique
  );
  if (legacyRoomIdx) {
    await Room.collection.dropIndex("ownerId_1_name_1");
    console.log("Dropped legacy unique index ownerId_1_name_1 on rooms.");
  }

  let migratedRooms = 0;
  for (const room of legacyRooms) {
    const collision = await Room.findOne({
      _id: { $ne: room._id },
      homeId: targetHome._id,
      name: room.name,
    }).lean();

    if (collision) {
      console.warn(
        `Skipping room "${room.name}" (${room._id}): room with same name already exists in target Home.`
      );
      continue;
    }

    await Room.updateOne(
      { _id: room._id, ...LEGACY_SCOPE_QUERY },
      { $set: { homeId: targetHome._id, ownerId: user._id } }
    );
    migratedRooms += 1;
  }

  const [deviceRes, commandRes, controllerHomeRes, controllerOwnerRes] =
    await Promise.all([
      Device.updateMany(LEGACY_SCOPE_QUERY, {
        $set: { homeId: targetHome._id, ownerId: user._id },
      }),
      Command.updateMany(LEGACY_SCOPE_QUERY, {
        $set: { homeId: targetHome._id, ownerId: user._id },
      }),
      Controller.updateMany(LEGACY_SCOPE_QUERY, {
        $set: { homeId: targetHome._id },
      }),
      Controller.updateMany(
        {
          $or: [{ ownerId: null }, { ownerId: LEGACY_OWNER_ID }],
          homeId: targetHome._id,
        },
        { $set: { ownerId: user._id } }
      ),
    ]);

  await Promise.all([
    User.syncIndexes(),
    Session.syncIndexes(),
    Home.syncIndexes(),
    Room.syncIndexes(),
    Device.syncIndexes(),
    Command.syncIndexes(),
    Controller.syncIndexes(),
    AutomationRule.syncIndexes(),
    Conversation.syncIndexes(),
  ]);

  console.log(
    `Migrated -> Rooms: ${migratedRooms}, Devices: ${deviceRes.modifiedCount}, Commands: ${commandRes.modifiedCount}, Controllers: ${controllerHomeRes.modifiedCount} (owner linked: ${controllerOwnerRes.modifiedCount})`
  );
  console.log("Synced Mongoose indexes across all collections.");
}

run()
  .catch((error) => {
    console.error("Legacy migration failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

