import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    supabaseId: { type: String, required: true, unique: true },
    role: { type: String, enum: ["customer", "artisan"], default: "customer" },
    fullName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    verified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "info_requested"],
      default: "pending",
      index: true,
    },
    avatarUrl: { type: String, trim: true },
    lastLoginAt: { type: Date },

    artisan: {
      trade: { type: String, trim: true, maxlength: 60 },
      category: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 40,
        index: true,
      },
      services: [{ type: String, trim: true, maxlength: 60 }],
      bio: { type: String, trim: true, maxlength: 1500 },
      experienceYears: { type: Number, min: 0, max: 60 },
      state: { type: String, trim: true },
      lga: { type: String, trim: true },
      location: { lat: Number, lng: Number },
      portfolio: [String], // https URLs
      available: { type: Boolean, default: true },
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    ratingBreakdown: { type: [Number], default: [0, 0, 0, 0, 0] }, // index 0 = 1 star
    paystackRecipientCode: { type: String },
    bank: {
      bankCode: String,
      bankName: String,
      accountName: String,
      accountLast4: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.hasPayoutAccount = Boolean(ret.paystackRecipientCode);
        delete ret.paystackRecipientCode;
        delete ret.ratingBreakdown;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export default mongoose.model("User", userSchema);
