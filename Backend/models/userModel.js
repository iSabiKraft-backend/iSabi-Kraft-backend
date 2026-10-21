import mongoose from "mongoose";
import { schemaOptions, toJSONOptions } from "../utils/schemaOptions.js";

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    // The sign-up screen has a "Full Name" field; stored split. Single names are allowed.
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: "" },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Provide a valid email address"],
    },
    
    phone: { 
      type: String, 
      unique: true, 
      sparse: true, 
      trim: true 
    }, // normalized "+234..."

    // select:false -> never loaded unless explicitly asked for (login).
    // Absent for accounts created with Google/Apple.
    password: { type: String, select: false },
    passwordChangedAt: { type: Date }, // bumped on reset

    role: { 
      type: String, 
      enum: ["customer", "artisan", "admin"], 
      default: "customer",
      index: true 
    },
    isActive: { type: Boolean, default: true },

    // --- Onboarding & Verification ---
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    verificationMethod: { type: String, enum: ["email", "sms"], default: "email" },
    
    authProviders: {
      type: [{ provider: { type: String, enum: ["google", "apple"] }, providerId: String, _id: false }],
      default: [],
      select: false,
    },

    // --- Profile Details ---
    avatarUrl: { type: String, default: null },
    state: { type: String, default: null },
    lga: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    address: { type: String, default: null },
    profileCompleted: { type: Boolean, default: false },

    // Live selfie verification
    selfieStatus: { 
      type: String, 
      enum: ["not_started", "pending_review", "approved", "rejected"], 
      default: "not_started" 
    },
    selfieReviewedAt: { type: Date, default: null },

    // Terms gate — checked via requireTermsAccepted before transacting
    termsAcceptedVersion: { type: String, default: null },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    ...schemaOptions,
    toJSON: {
      ...toJSONOptions,
      transform: (doc, ret) => {
        if (toJSONOptions.transform) {
          toJSONOptions.transform(doc, ret);
        }
        ret.fullName = `${ret.firstName} ${ret.lastName || ""}`.trim();
        ret.isVerified = Boolean(ret.emailVerified || ret.phoneVerified);
        ret.selfieVerified = ret.selfieStatus === "approved";
        delete ret.passwordChangedAt;
        delete ret.authProviders;
        return ret;
      },
    },
  }
);

const User = model("User", userSchema);

export default User;