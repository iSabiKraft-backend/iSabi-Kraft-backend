import mongoose from "mongoose";
import { schemaOptions, toJSONOptions } from "../utils/schemaOptions.js";

export const CORE_CATEGORIES = ["electrical", "cleaning", "carpentry"];
export const VERIFICATION_TIERS = ["unverified", "basic", "verified", "pro"];
export const VERIFICATION_STATUSES = ["not_submitted", "pending", "approved", "rejected"];

// "Experience Level" dropdown on Complete Your Profile. `years` is the lower bound stored in
// yearsExperience so existing numeric filters keep working.
export const EXPERIENCE_LEVELS = [
  { value: "less_than_1", label: "Less than 1 year", years: 0 },
  { value: "1_3", label: "1 - 3 years", years: 1 },
  { value: "3_5", label: "3 - 5 years", years: 3 },
  { value: "5_10", label: "5 - 10 years", years: 5 },
  { value: "10_plus", label: "10+ years", years: 10 },
];

/**
 * Downstream contract (Dev 2 / Dev 3 — do not change without a team sync):
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
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS.map((l) => l.value), default: null },

    // An artisan can operate in more than one category (e.g. electrical + carpentry).
    categories: {
      type: [{ type: String, enum: CORE_CATEGORIES }],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: "Select at least one category" },
      index: true,
    },

    // MVP scope is a single LGA (PRD §11) — plain state/lga fields rather than geo-coordinates.
    state: { type: String, required: true, trim: true },
    lga: { type: String, required: true, trim: true },
    address: { type: String, default: null }, // public business address (shown on the profile)

    // "Residential Address" on Complete Your Profile: "kept private and used only for verification
    // purposes". select:false -> never in public responses; the owner and admins load it explicitly.
    residentialAddress: { type: String, default: null, select: false },

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
    // Uploaded NIN/BVN slip (front & back). Files live in the PRIVATE directory (never served);
    // this array only holds metadata. select:false, and toJSON below strips file names.
    verificationDocuments: {
      type: [{ _id: false, filename: String, mimeType: String, sizeBytes: Number, sha256: String, uploadedAt: Date }],
      default: [],
      select: false,
    },
    verificationConsentAt: { type: Date, default: null }, // "I consent to the verification of my NIN/BVN..."
    verificationSubmittedAt: { type: Date, default: null }, // "Registration Completed" on the review screen
    verificationDocsPurgeAfter: { type: Date, default: null, select: false },
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
  {
    ...schemaOptions,
    toJSON: {
      ...toJSONOptions,
      transform: (doc, ret) => {
        toJSONOptions.transform(doc, ret);
        if (ret.verificationDocuments) {
          ret.verificationDocuments = ret.verificationDocuments.map((d, index) => ({
            index,
            mimeType: d.mimeType,
            sizeBytes: d.sizeBytes,
            uploadedAt: d.uploadedAt,
          }));
        }
        return ret;
      },
    },
  }
);

artisanProfileSchema.pre("validate", function () {
  this.verificationTierRank = VERIFICATION_TIERS.indexOf(this.verificationTier);
});

artisanProfileSchema.index({ isAcceptingJobs: 1, verificationTierRank: -1, avgRating: -1 });

export default mongoose.model("ArtisanProfile", artisanProfileSchema);

