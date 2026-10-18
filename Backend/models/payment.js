import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

const paymentSchema = new mongoose.Schema(
  {
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobID: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
    authorizationUrl: { type: String },
    paidAt: { type: Date },
  },
  schemaOptions
);

export default mongoose.model("Payment", paymentSchema);
