import mongoose from "mongoose";

const escrowTransactionSchema = new mongoose.Schema(
  {
    escrowID: { type: mongoose.Schema.Types.ObjectId, ref: "Escrow", required: true, index: true },
    transactionType: { type: String, enum: ["material_payment", "balance_release", "refund"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
    paidAt: Date,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

export default mongoose.model("EscrowTransaction", escrowTransactionSchema);
