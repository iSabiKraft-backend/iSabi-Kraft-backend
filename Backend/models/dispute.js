import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

const evidenceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    note: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    artisanId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    evidence: { type: [evidenceSchema], default: [] },
    status: {
      type: String,
      enum: ["open", "under_review", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    resolution: {
      decision: { type: String, enum: ["refund_customer", "release_artisan", "split", "dismissed"] },
      customerPercent: { type: Number, min: 0, max: 100 },
      note: { type: String, trim: true, maxlength: 2000 },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      resolvedAt: Date,
    },
  },
  schemaOptions
);

disputeSchema.index(
  { job: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["open", "under_review"] } } }
);

export default mongoose.model("Dispute", disputeSchema);
