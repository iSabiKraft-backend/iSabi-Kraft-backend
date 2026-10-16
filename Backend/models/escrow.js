import mongoose from "mongoose";

//Escrow schema
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
        required: true
    },
    materialAmount: {
        type: Number,
        required: true
    },
    remainingAmount: {
        type: Number,
        required: true
    },
    heldAmount: {
        type: Number,
        required: true
    },  
    reference: {
        type: String,
        required: true,
        unique: true
    },
    status: { 
        type: String,
        enum: ["pending","payment_confirmed", "material_payment_made", "balance_released", "disputed", "refunded", "failed"],
        default: "pending"
    },
    materialPaymentStatus: {
        type: String,
        enum: ["pending", "completed", "failed", "not_applicable"],
        default: "pending"
    },
    balancePaymentStatus: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending"
    },
    materialTranferCode: {
        type: String
    },
    finalTransferCode: {
        type: String
    },
    completedAt: {
        type: Date
    }
  },
  { timestamps: true }
);

export default mongoose.model("Escrow", escrowSchema);
