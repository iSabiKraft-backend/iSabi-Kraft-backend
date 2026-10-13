import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

export const CORE_CATEGORIES = ["electrical", "cleaning", "carpentry"];
export const VERIFICATION_TIERS = ["unverified", "basic", "verified", "pro"];
export const VERIFICATION_STATUSES = ["not_submitted", "pending", "approved", "rejected"];

/**
 * Downstream contract (Dev 2 / Dev 3 — do not change without a team sync):
 *   - `id` is the `artisanId` referenced by Job/Quote (Dev 2) and eventually
 *     Payment/Dispute (Dev 3).
 *   - `verificationStatus === "approved"` is the single source of truth for
 *     "this artisan is allowed to receive jobs" — check it, don't re-derive it.
 *   - `avgRating` / `totalReviews` are written ONLY by Dev 2's review
 *     service (inside the same transaction that creates a Review).
 */
const ArtisanProfile = sequelize.define(
  "ArtisanProfile",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },

    businessName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    yearsExperience: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    // Postgres native array — an artisan can operate in more than one
    // category (e.g. electrical + carpentry).
    categories: {
      type: DataTypes.ARRAY(DataTypes.ENUM(...CORE_CATEGORIES)),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Select at least one category" },
      },
    },

    // MVP scope is a single LGA (PRD §11) — plain state/lga fields rather
    // than geo-coordinates, since there's no map/search-radius feature in
    // scope yet. Extending to geo later is additive.
    state: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    lga: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // --- Verification (PRD §4, §11: "Basic verification (NIN/BVN + manual
    // review)", "Tiered verification badges") ---
    // The raw NIN/BVN is never stored — see utils/hashIdNumber.js. Only a
    // salted hash (for matching/uniqueness) and the last 4 digits (for the
    // artisan/admin to visually confirm which document is on file).
    verificationIdType: {
      type: DataTypes.ENUM("NIN", "BVN"),
      allowNull: true,
    },

    verificationIdNumberHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    verificationIdNumberLast4: {
      type: DataTypes.STRING(4),
      allowNull: true,
    },

    verificationStatus: {
      type: DataTypes.ENUM(...VERIFICATION_STATUSES),
      allowNull: false,
      defaultValue: "not_submitted",
    },

    verificationTier: {
      type: DataTypes.ENUM(...VERIFICATION_TIERS),
      allowNull: false,
      defaultValue: "unverified",
    },

    verificationReviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    verificationReviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    verificationRejectionReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    avgRating: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },

    totalReviews: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    totalCompletedJobs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    isAcceptingJobs: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "artisan_profiles",
    timestamps: true,
  }
);

export default ArtisanProfile;
