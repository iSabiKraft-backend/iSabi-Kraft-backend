import mongoose from "mongoose";

const escrowSchema = new mongoose.Schema(
  {
    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    artisanID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      unique: true,
    },
    currency: { type: String, default: "NGN" },
    totalAmount: { type: Number, required: true },
    materialAmount: { type: Number, required: true },
    remainingAmount: { type: Number, required: true },
    heldAmount: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    reference: { type: String, required: true, unique: true },
    paymentReference: String,
    status: {
      type: String,
      enum: [
        "pending",
        "payment_confirmed",
        "material_payment_made",
        "balance_released",
        "disputed",
        "refunded",
        "failed",
      ],
      default: "pending",
    },
    statusBeforeDispute: String,
    materialPaymentStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "not_applicable"],
      default: "pending",
    },
    balancePaymentStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    materialTransferCode: String,
    finalTransferCode: String,
    materialApprovalStatus: {
      type: String,
      enum: ["not_requested", "awaiting_approval", "approved", "rejected", "processing", "completed", "failed"],
      default: "not_requested",
    },
    materialApprovalRequestedAt: Date,
    materialApprovalReviewedAt: Date,
    // Material request details submitted by the artisan.
    materialRequestNote: { type: String, trim: true, maxlength: 1000 },
    materialEvidenceUrls: { type: [{ type: String, trim: true }], default: [], validate: v => v.length <= 10 },
    // New names; legacy fields below remain for backwards compatibility.
    materialReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    materialRejectionReason: { type: String, trim: true, maxlength: 500 },
    materialApprovalAdminID: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    materialApprovalReason: { type: String, trim: true, maxlength: 500 },
    balanceApprovalStatus: {
      type: String,
      enum: ["not_requested", "awaiting_approval", "approved", "rejected", "processing", "completed", "failed"],
      default: "not_requested",
    },
    balanceApprovalRequestedAt: Date,
    balanceApprovalReviewedAt: Date,
    balanceApprovalAdminID: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    balanceApprovalReason: { type: String, trim: true, maxlength: 500 },
    // Three-day dispute window starts when the artisan submits completion evidence.
    disputeWindowEndsAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Escrow", escrowSchema);
