import mongoose from "mongoose";

const toolExecutionSchema = new mongoose.Schema(
  {
    toolName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "partial",
        "completed",
        "clarification",
        "not_found",
        "failed",
      ],
      required: true,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    commandIds: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [8000, "Message content cannot exceed 8000 characters"],
    },
    inputMode: {
      type: String,
      enum: ["text", "voice"],
      default: "text",
    },
    toolExecutions: {
      type: [toolExecutionSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    homeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      required: [true, "Home reference is required"],
    },
    title: {
      type: String,
      trim: true,
      maxlength: [120, "Conversation title cannot exceed 120 characters"],
      default: "New Conversation",
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMessageAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ userId: 1, homeId: 1, lastMessageAt: -1 });
conversationSchema.index({ _id: 1, userId: 1, homeId: 1 });

const Conversation =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);

export default Conversation;

