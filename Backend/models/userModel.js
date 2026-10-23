import mongoose from "mongoose";
import { schemaOptions, toJSONOptions } from "../utils/schemaOptions.js";

const userSchema = new mongoose.Schema(
  {
    // The sign-up screen has one "Full Name" field; it's stored split. Single names are allowed.
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: "" },

    // Email and phone are each optional on the sign-up screen (at least one is
    // required, enforced in the service). Unique + sparse: users without one
    // don't collide. Never store null here — leave the field unset.
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Provide a valid email address"],
    },
    phone: { type: String, unique: true, sparse: true, trim: true }, // normalized "+234..."

    // select:false -> never loaded unless explicitly asked for (login).
    // Absent for accounts created with Google/Apple.
    password: { type: String, select: false },
    passwordChangedAt: { type: Date }, // bumped on reset; tokens carry the value they were issued under

    role: { type: String, enum: ["customer", "artisan", "admin"], default: "customer" },
    isActive: { type: Boolean, default: true },

    // --- Onboarding ---
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    verificationMethod: { type: String, enum: ["email", "sms"], default: "email" }, // "Choose your verification method"
    authProviders: {
      type: [{ provider: { type: String, enum: ["google", "apple"] }, providerId: String, _id: false }],
      default: [],
      select: false,
    },

    // "Complete Your Profile" (step 2 of 2)
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null, select: false },
    state: { type: String, default: null },
    lga: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    address: { type: String, default: null },
    profileCompleted: { type: Boolean, default: false },

    // Live selfie verification (see selfieVerificationService.js)
    selfieStatus: { type: String, enum: ["not_started", "pending_review", "approved", "rejected"], default: "not_started" },
    selfieReviewedAt: { type: Date, default: null },

    // Terms gate — Dev 2 (job posting) and Dev 3 (payment) both check this
    // via requireTermsAccepted before letting a user transact.
    termsAcceptedVersion: { type: String, default: null },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    ...schemaOptions,
    toJSON: {
      ...toJSONOptions,
      transform: (doc, ret) => {
        toJSONOptions.transform(doc, ret);
        ret.fullName = `${ret.firstName} ${ret.lastName || ""}`.trim();
        ret.isVerified = Boolean(ret.emailVerified || ret.phoneVerified);
        ret.selfieVerified = ret.selfieStatus === "approved";
        delete ret.passwordChangedAt;
        delete ret.authProviders;
        delete ret.avatarPublicId;
        return ret;
      },
    },
  }
);

export default mongoose.model("User", userSchema);
