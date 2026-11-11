import mongoose from "mongoose";

const relayChannelConfigSchema = new mongoose.Schema(
  {
    relayNumber: {
      type: Number,
      required: true,
      min: [1, "Relay number must be at least 1"],
      max: [32, "Relay number cannot exceed 32"],
      validate: {
        validator: (value) => Number.isInteger(value),
        message: "Relay number must be a whole integer",
      },
    },
    gpioPin: {
      type: Number,
      default: null,
      min: [0, "GPIO pin must be non-negative"],
      max: [39, "GPIO pin cannot exceed 39"],
      validate: {
        validator: (value) =>
          value === null || value === undefined || Number.isInteger(value),
        message: "GPIO pin must be a whole integer",
      },
    },
    activeLevel: {
      type: String,
      enum: ["LOW", "HIGH"],
      default: "LOW",
    },
    safeBootState: {
      type: String,
      enum: ["off"],
      default: "off",
    },
  },
  { _id: false }
);

const controllerSchema = new mongoose.Schema(
  {
    esp32DeviceId: {
      type: String,
      required: [true, "esp32DeviceId is required"],
      unique: true,
      trim: true,
      minlength: [1, "esp32DeviceId cannot be empty"],
      maxlength: [100, "esp32DeviceId cannot exceed 100 characters"],
    },
    name: {
      type: String,
      trim: true,
      default: "",
      maxlength: [80, "Controller name cannot exceed 80 characters"],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner reference is required"],
    },
    tokenHash: {
      type: String,
      select: false,
      default: null,
    },
    previousTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    previousTokenExpiresAt: {
      type: Date,
      default: null,
    },
    tokenPrefix: {
      type: String,
      trim: true,
      maxlength: [16, "Token prefix cannot exceed 16 characters"],
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: {
        values: ["provisioning", "active", "revoked"],
        message: "Invalid controller status",
      },
      required: true,
      default: "active",
    },
    relayConfig: {
      type: [relayChannelConfigSchema],
      default: [],
    },
    firmwareVersion: {
      type: String,
      trim: true,
      maxlength: [40, "firmwareVersion cannot exceed 40 characters"],
      default: null,
    },
    lastRssi: {
      type: Number,
      default: null,
    },
    lastBootReason: {
      type: String,
      trim: true,
      maxlength: [80, "lastBootReason cannot exceed 80 characters"],
      default: null,
    },
    freeHeapBytes: {
      type: Number,
      default: null,
    },
    uptimeSeconds: {
      type: Number,
      default: null,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

controllerSchema.index({ ownerId: 1, status: 1 });
controllerSchema.index({ status: 1, lastSeen: 1 });

const Controller =
  mongoose.models.Controller || mongoose.model("Controller", controllerSchema);

export default Controller;

