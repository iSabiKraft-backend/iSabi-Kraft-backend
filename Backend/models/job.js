import mongoose from "mongoose";

const quoteSchema = new mongoose.Schema(
  {
    artisanID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    labour: { type: Number, required: true, min: 0 },
    materials: { type: Number, required: true, min: 0 },
    materialItems: [{
      name: { type: String, trim: true, maxlength: 80 },
      quantity: { type: Number, min: 0 },
      unitPrice: { type: Number, min: 0 },
      total: { type: Number, min: 0 },
    }],
    additional: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 1 },
    duration: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },

    changeRequest: {
      type: { type: String, trim: true },
      description: { type: String, trim: true, maxlength: 1000 },
      details: { type: String, trim: true, maxlength: 1000 },
      proposedDate: Date,
      photos: [String], // https URLs
      status: { type: String, enum: ["pending", "resolved"] },
      createdAt: Date,
      resolvedAt: Date,
    },
    previousTotal: Number,
  },
  { timestamps: true },
);

const jobSchema = new mongoose.Schema(
  {
    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    artisanID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    invitedArtisanID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    jobType: { type: String, trim: true },
    urgency: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    location: { lat: Number, lng: Number },
    photos: [String],
    preferredDate: Date,
    preferredTime: String,
    budget: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: [
        "open",
        "booked",
        "funded",
        "awaiting_confirmation",
        "completed",
        "disputed",
        "cancelled",
      ],
      default: "open",
      index: true,
    },
    quotes: [quoteSchema],
    acceptedQuoteID: mongoose.Schema.Types.ObjectId,
    agreedAmount: Number,
    changeRequests: [
      {
        requestedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        reason: { type: String, required: true, maxlength: 1000 },
        proposedAmount: { type: Number, min: 0 },
        proposedDate: Date,
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        respondedAt: Date,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    completionNote: { type: String, trim: true, maxlength: 1000 },
    completionMarkedAt: Date,
    completionPhotos: [String],
    progress: { type: Number, min: 0, max: 100, default: 0 },
    progressUpdates: [
      {
        note: { type: String, trim: true, maxlength: 1000 },
        percent: { type: Number, min: 0, max: 100 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("Job", jobSchema);
