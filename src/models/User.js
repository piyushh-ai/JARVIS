import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
    },
    passwordHash: {
      type: String,
      select: false,
      default: undefined,
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      required: true,
      default: "member",
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      required: true,
      default: "active",
    },
    currentHomeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      default: null,
    },
    preferences: {
      theme: {
        type: String,
        enum: ["dark"],
        default: "dark",
      },
      voiceFeedback: {
        type: Boolean,
        default: true,
      },
      reducedMotion: {
        type: Boolean,
        default: false,
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
