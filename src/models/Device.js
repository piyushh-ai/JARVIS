import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Device name is required"],
      trim: true,
      minlength: [1, "Device name cannot be empty"],
      maxlength: [80, "Device name cannot exceed 80 characters"],
    },
    type: {
      type: String,
      enum: {
        values: ["light", "fan", "led", "other"],
        message: "Device type must be light, fan, led, or other",
      },
      required: [true, "Device type is required"],
      default: "other",
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: [true, "Room reference is required"],
    },
    homeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner reference is required"],
    },
    esp32DeviceId: {
      type: String,
      trim: true,
      default: null,
      maxlength: [100, "ESP32 device ID cannot exceed 100 characters"],
    },
    relayNumber: {
      type: Number,
      default: null,
      min: [1, "Relay number must be at least 1"],
      max: [32, "Relay number cannot exceed 32"],
      validate: {
        validator: (value) =>
          value === null || value === undefined || Number.isInteger(value),
        message: "Relay number must be a whole integer",
      },
    },
    desiredState: {
      type: String,
      enum: ["on", "off"],
      required: true,
      default: "off",
    },
    reportedState: {
      type: String,
      enum: ["on", "off", "unknown"],
      required: true,
      default: "unknown",
    },
    connectionStatus: {
      type: String,
      enum: ["online", "offline", "unknown"],
      required: true,
      default: "unknown",
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

// Fast queries for home/user/room device lists and state filtering.
deviceSchema.index({ homeId: 1, roomId: 1 });
deviceSchema.index({ homeId: 1, desiredState: 1 });
deviceSchema.index({ ownerId: 1, roomId: 1 });
deviceSchema.index({ roomId: 1, desiredState: 1 });

// Ensures one relay pin on a paired ESP32 controller maps to at most one device.
deviceSchema.index(
  { esp32DeviceId: 1, relayNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      esp32DeviceId: { $type: "string" },
      relayNumber: { $type: "number" },
    },
  }
);

const Device = mongoose.models.Device || mongoose.model("Device", deviceSchema);

export default Device;
