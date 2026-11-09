import mongoose from "mongoose";

const disputeSchema = new mongoose.Schema({
  escrowID: { type: mongoose.Schema.Types.ObjectId, ref: "Escrow", required: true, index: true },
  jobID: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  evidence: [{
    url: { type: String, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    addedAt: { type: Date, default: Date.now },
  }],
  response: {
    text: { type: String, trim: true, maxlength: 2000 },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    respondedAt: Date,
  },
  status: { type: String, enum: ["open", "in_review", "resolved"], default: "open" },
  resolution: { type: String, enum: ["release", "refund"] },
  adminNote: { type: String, trim: true, maxlength: 1000 },
  adminNotes: [{
    note: { type: String, required: true, maxlength: 1000 },
    adminID: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  resolvedAt: Date,
}, { timestamps: true });

export default mongoose.model("Dispute", disputeSchema);
