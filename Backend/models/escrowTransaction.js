import mongoose from "mongoose";

//Escrow Transaction schema
const escrowTransactionSchema = new mongoose.Schema(
  {
    escrowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Escrow",
        required: true,
        index: true
    },
    transactionType: {
        type: String,
        enum: ["material_payment", "balance_release", "funding"],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,   
        default: "NGN"
    },
    providerReference: {
        type: String,
        required: true,
        unique: true,
        trim: true 
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed", "reversed"],
        default: "pending",
        index: true
    },
    paidAt: {
        type: Date,
        index: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
  },
  { timestamps: true }
);

export default mongoose.model("EscrowTransaction", escrowTransactionSchema);