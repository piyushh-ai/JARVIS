import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Room name is required"],
      trim: true,
      minlength: [1, "Room name cannot be empty"],
      maxlength: [80, "Room name cannot exceed 80 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [300, "Description cannot exceed 300 characters"],
    },
    homeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Home",
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Room owner is required"],
    },
  },
  {
    timestamps: true,
  }
);

// Scope unique room names per Home for all migrated and newly created rooms
roomSchema.index(
  { homeId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { homeId: { $type: "objectId" } },
  }
);
roomSchema.index({ homeId: 1, createdAt: -1 });
roomSchema.index({ ownerId: 1, name: 1 });

const Room = mongoose.models.Room || mongoose.model("Room", roomSchema);

export default Room;
