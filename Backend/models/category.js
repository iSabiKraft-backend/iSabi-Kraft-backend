import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  normalizedName: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

categorySchema.index({ status: 1, name: 1 });
export default mongoose.model("Category", categorySchema);
