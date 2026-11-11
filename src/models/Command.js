import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

const commandSchema = new mongoose.Schema(
  {
    commandId: {
      type: String,
      required: true,
      unique: true,
      default: () => `cmd_${randomUUID()}`,
      trim: true,
    },
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      required: [true, "Device reference is required"],
    },
    esp32DeviceId: {
      type: String,
      required: [true, "ESP32 device ID is required for hardware commands"],
      trim: true,
      minlength: [1, "ESP32 device ID cannot be empty"],
      maxlength: [100, "ESP32 device ID cannot exceed 100 characters"],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner reference is required"],
    },
    relayNumber: {
      type: Number,
      required: [true, "Relay number is required for hardware commands"],
      min: [1, "Relay number must be at least 1"],
      max: [32, "Relay number cannot exceed 32"],
      validate: {
        validator: (value) => Number.isInteger(value),
        message: "Relay number must be a whole integer",
      },
    },
    action: {
      type: String,
      enum: {
        values: ["on", "off"],
        message: "Action must be on or off",
      },
      required: [true, "Command action is required"],
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "processing", "success", "failed", "expired"],
        message: "Invalid command status",
      },
      required: true,
      default: "pending",
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: [0, "attemptCount cannot be negative"],
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: [1, "maxAttempts must be at least 1"],
      max: [10, "maxAttempts cannot exceed 10"],
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingUntil: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: [true, "Command expiration timestamp is required"],
    },
    retainUntil: {
      type: Date,
      required: [true, "Retention timestamp is required"],
    },
    executedAt: {
      type: Date,
      default: null,
    },
    result: {
      type: String,
      trim: true,
      maxlength: [300, "Result cannot exceed 300 characters"],
      default: null,
    },
    errorReason: {
      type: String,
      trim: true,
      maxlength: [300, "Error reason cannot exceed 300 characters"],
      default: null,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: [128, "idempotencyKey cannot exceed 128 characters"],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Atomic claim queue index for ESP32 polling & stale-command expiry sweeps
commandSchema.index({ esp32DeviceId: 1, status: 1, expiresAt: 1, createdAt: 1 });

// Device command history & pending supersede lookups
commandSchema.index({ deviceId: 1, status: 1, createdAt: -1 });

// Unique duplicate-submission guard when a non-empty string idempotencyKey is supplied
commandSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

// Automatic MongoDB TTL purge for long-term retention cleanup (does not delete short-lived expired records immediately)
commandSchema.index({ retainUntil: 1 }, { expireAfterSeconds: 0 });

const Command =
  mongoose.models.Command || mongoose.model("Command", commandSchema);

export default Command;

