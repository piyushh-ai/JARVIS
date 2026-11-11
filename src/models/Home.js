import mongoose from "mongoose";

const homeMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      required: true,
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
);

const homeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Home name is required"],
      trim: true,
      minlength: [1, "Home name cannot be empty"],
      maxlength: [80, "Home name cannot exceed 80 characters"],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Home owner is required"],
    },
    members: {
      type: [homeMemberSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

homeSchema.index({ ownerId: 1 });
homeSchema.index({ "members.userId": 1 });

const Home = mongoose.models.Home || mongoose.model("Home", homeSchema);

export default Home;

