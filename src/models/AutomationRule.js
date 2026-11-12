import mongoose from "mongoose";

const automationActionSchema = new mongoose.Schema(
  {
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      required: true,
    },
    action: {
      type: String,
      enum: ["on", "off"],
      required: true,
    },
  },
  { _id: false }
);

const executionLogSchema = new mongoose.Schema(
  {
    triggeredAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    status: {
      type: String,
      enum: ["queued", "partial", "failed"],
      required: true,
    },
    queuedCommandIds: {
      type: [String],
      default: [],
    },
    errorReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
  },
  { _id: false }
);

const automationRuleSchema = new mongoose.Schema(
  {
    homeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Rule name is required"],
      trim: true,
      maxlength: 100,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    triggerType: {
      type: String,
      enum: ["cron", "sunset", "sunrise", "sensor", "manual"],
      required: true,
    },
    scheduleCron: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
    offsetMinutes: {
      type: Number,
      default: 0,
      min: -240,
      max: 240,
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: "UTC",
    },
    manualOverrideUntil: {
      type: Date,
      default: null,
    },
    actions: {
      type: [automationActionSchema],
      default: [],
    },
    nextRunAt: {
      type: Date,
      default: null,
    },
    lastTriggeredAt: {
      type: Date,
      default: null,
    },
    recentExecutions: {
      type: [executionLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

automationRuleSchema.index({ homeId: 1, enabled: 1, createdAt: -1 });
automationRuleSchema.index({ enabled: 1, nextRunAt: 1 });

const AutomationRule =
  mongoose.models.AutomationRule ||
  mongoose.model("AutomationRule", automationRuleSchema);

export default AutomationRule;

