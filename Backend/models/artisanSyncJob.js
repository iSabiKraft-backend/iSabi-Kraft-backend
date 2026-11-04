import mongoose from "mongoose";

const artisanSyncJobSchema = new mongoose.Schema({
  supabaseId: { type: String, required: true, unique: true },
  status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending", index: true },
  attempts: { type: Number, default: 0 },
  rerunRequested: { type: Boolean, default: false },
  nextRunAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  lastError: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

artisanSyncJobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 2592000, partialFilterExpression: { status: "completed" } });
export default mongoose.model("ArtisanSyncJob", artisanSyncJobSchema);
