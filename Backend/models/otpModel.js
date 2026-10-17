import mongoose from "mongoose";

// One row per (user, purpose): either a 6-digit verification code ("verify")
// or a password-reset link token ("reset"). Only a hash is stored, never the
// code/token itself. Rows delete themselves after `expiresAt` (TTL index).
const otpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["verify", "reset"], required: true },
    channel: { type: String, enum: ["email", "sms"], required: true },
    destination: { type: String, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

otpSchema.index({ userId: 1, purpose: 1 }, { unique: true });
otpSchema.index({ codeHash: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Otp", otpSchema);
