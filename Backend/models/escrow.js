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
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    artisanID: { type: mongoose.Schema.Types.ObjectId, ref: "ArtisanProfile", required: true },
    jobID: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    currency: { type: String, default: "NGN" },
    totalAmount: { type: Number, required: true },
    materialAmount: { type: Number, required: true, default: 0 },
    remainingAmount: { type: Number, required: true },
    heldAmount: { type: Number, required: true, default: 0 },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ESCROW_STATUSES, default: "pending" },
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
    // Number of FAILED payout attempts per leg. Part of each transfer's reference, so parallel
    // requests for the same attempt collide on the unique reference instead of paying twice.
    materialAttempts: { type: Number, default: 0 },
    balanceAttempts: { type: Number, default: 0 },
    materialTransferCode: { type: String },
    finalTransferCode: { type: String },
    completedAt: { type: Date },
  },
  schemaOptions
);

export default mongoose.model("Escrow", escrowSchema);
