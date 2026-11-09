import mongoose from "mongoose";

const adminAuditSchema = new mongoose.Schema({
  adminID: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: { type: String, required: true, trim: true },
  targetType: { type: String, required: true, trim: true },
  targetID: { type: String, required: true, trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

adminAuditSchema.index({ createdAt: -1 });
export default mongoose.model("AdminAudit", adminAuditSchema);
