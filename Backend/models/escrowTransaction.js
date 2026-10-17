import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

const escrowTransactionSchema = new mongoose.Schema(
  {
    escrowID: { type: mongoose.Schema.Types.ObjectId, ref: "Escrow", required: true },
    transactionType: {
      type: String,
      enum: ["funding", "material_payment", "balance_release", "refund"],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
    paidAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  schemaOptions
);

export default mongoose.model("EscrowTransaction", escrowTransactionSchema);
