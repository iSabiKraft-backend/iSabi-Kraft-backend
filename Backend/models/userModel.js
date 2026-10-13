import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Provide a valid email address"],
    },
    phone: { type: String, required: true, unique: true, trim: true },
    
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["customer", "artisan", "admin"], default: "customer" },
    isActive: { type: Boolean, default: true },

    // Terms gate — Dev 2 (job posting) and Dev 3 (payment) both check this
    // via requireTermsAccepted before letting a user transact.
    termsAcceptedVersion: { type: String, default: null },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  schemaOptions
);

export default mongoose.model("User", userSchema);

