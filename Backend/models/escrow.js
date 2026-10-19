import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

export const ESCROW_STATUSES = [
  "pending",
  "payment_confirmed",
  "material_payment_made",
  "balance_released",
  "disputed",
  "refunded",
  "failed",
];

// "processing" = a Paystack transfer for that leg has been claimed/started and
// we're waiting for the webhook. It is what stops a double click paying twice.
const escrowSchema = new mongoose.Schema(
  {
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    artisanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
        required: true
    },
        currency: {
        type: String,
        default: "NGN"
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    materialAmount: {
        type: Number,
        required: true,
        min: 0
    },
    remainingAmount: {
        type: Number,
        required: true,
        min: 0
    },
    heldAmount: {
        type: Number,
        required: true,
        min: 0
    },  
    reference: {
        type: String,
        required: true,
        unique: true
    },
    paystackReference: {
        type: String,
        unique: true,
        sparse: true
    },
    status: { 
        type: String,
        enum: ["pending","payment_confirmed", "material_payment_made", "balance_released", "disputed", "refunded", "failed"],
        default: "pending"
    },
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
    materialAttempts: { type: Number, default: 0, min: 0 },
    balanceAttempts: { type: Number, default: 0, min: 0 },
    materialTransferCode: {
        type: String
    },
    finalTransferCode: {
        type: String
    },
    completedAt: {
        type: Date
    }
  },
  schemaOptions
);

escrowSchema.index({ jobId: 1 }, { unique: true });

export default mongoose.model("Escrow", escrowSchema);
