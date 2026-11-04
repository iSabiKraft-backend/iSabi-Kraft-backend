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
    completedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Escrow", escrowSchema);
