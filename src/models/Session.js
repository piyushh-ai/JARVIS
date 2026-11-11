import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Session userId is required"],
    },
    tokenHash: {
      type: String,
      required: [true, "Session tokenHash is required"],
      unique: true,
      trim: true,
    },
    currentHomeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      default: null,
    },
    expiresAt: {
      type: Date,
      required: [true, "Session expiration timestamp is required"],
    },
    lastUsedAt: {
      type: Date,
      default: () => new Date(),
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

sessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);

export default Session;

