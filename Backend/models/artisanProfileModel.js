import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

export const CORE_CATEGORIES = ["electrical", "cleaning", "carpentry"];
export const VERIFICATION_TIERS = ["unverified", "basic", "verified", "pro"];
export const VERIFICATION_STATUSES = ["not_submitted", "pending", "approved", "rejected"];

/**
 *   - `id` is the `artisanId` referenced by Job/Quote (Dev 2) and eventually
 *     Payment/Dispute (Dev 3).
 *   - `verificationStatus === "approved"` is the single source of truth for
 *     "this artisan is allowed to receive jobs" — check it, don't re-derive it.
 *   - `avgRating` / `totalReviews` are written ONLY by Dev 2's review service.
 */
const artisanProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    businessName: { type: String, required: true, trim: true },
    bio: { type: String, default: null },
    yearsExperience: { type: Number, default: 0, min: 0 },

    // An artisan can operate in more than one category (e.g. electrical + carpentry).
    categories: {
      type: [{ type: String, enum: CORE_CATEGORIES }],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: "Select at least one category" },
      index: true,
    },

    // MVP scope is a single LGA (PRD §11) — plain state/lga fields rather than geo-coordinates.
    state: { type: String, required: true, trim: true },
    lga: { type: String, required: true, trim: true },
    address: { type: String, default: null },

    // --- Verification (PRD §4, §11) ---
    // The raw NIN/BVN is never stored — see utils/hashIdNumber.js. Only a
    // peppered hash (select:false, never returned) and the last 4 digits.
    verificationIdType: { type: String, enum: ["NIN", "BVN"], default: null },
    verificationIdNumberHash: { type: String, default: null, select: false },
    verificationIdNumberLast4: { type: String, maxlength: 4, default: null },
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: "not_submitted" },
    verificationTier: { type: String, enum: VERIFICATION_TIERS, default: "unverified" },
    // Numeric copy of the tier so search can sort by it (string sort would be alphabetical).
    // Kept in sync automatically by the pre-validate hook below.
    verificationTierRank: { type: Number, default: 0, select: false },
    verificationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verificationReviewedAt: { type: Date, default: null },
    verificationRejectionReason: { type: String, default: null },

    avgRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    totalCompletedJobs: { type: Number, default: 0 },

    // Paystack transfer recipient (RCP_...) used by the escrow service to pay
    // this artisan out. Internal only — never returned in API responses.
    paystackRecipientCode: { type: String, default: null, select: false },

    isAcceptingJobs: { type: Boolean, default: true },
  },
  schemaOptions
);

artisanProfileSchema.pre("validate", function () {
  this.verificationTierRank = VERIFICATION_TIERS.indexOf(this.verificationTier);
});

artisanProfileSchema.index({ isAcceptingJobs: 1, verificationTierRank: -1, avgRating: -1 });

export default mongoose.model("ArtisanProfile", artisanProfileSchema);
