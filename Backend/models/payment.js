import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobID: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    escrowID: { type: mongoose.Schema.Types.ObjectId, ref: "Escrow" },
    amount: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
    authorizationUrl: String,
    paidAt: Date,
    note: String,
  },
  { timestamps: true },
);

export default mongoose.model("Payment", paymentSchema);
