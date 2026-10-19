
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const passportEventSchema = new Schema({
  type: { type: String, required: true, maxlength: 80 },
  actorID: { type: Schema.Types.ObjectId, ref: "User", default: null },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const changeRequestSchema = new Schema({
  proposedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  priceAdjustment: { type: Number, default: 0 },
  scheduleAdjustment: { type: String, default: "", trim: true, maxlength: 500 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const completionEvidenceSchema = new Schema({
  url: { type: String, required: true, trim: true, maxlength: 2048 },
  note: { type: String, default: "", trim: true, maxlength: 1000 },
  submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  submittedAt: { type: Date, default: Date.now },
}, { _id: true });

const jobSchema = new Schema(
  {
    customerID: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    artisanID: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    title: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      minlength: [5, "Job title must be at least 5 characters"],
      maxlength: [120, "Job title cannot exceed 120 characters"],
    },

    description: {
      type: String,
      required: [true, "Job description is required"],
      trim: true,
      minlength: [20, "Description must be at least 20 characters"],
      maxlength: [3000, "Description cannot exceed 3000 characters"],
    },

    category: {
      type: String,
      required: [true, "Job category is required"],
      enum: {
        values: [
          "plumbing",
          "electrical",
          "carpentry",
          "painting",
          "welding",
          "masonry",
          "tiling",
          "ac_repairs",
          "other",
        ],
        message: "Invalid job category selected",
      },
      index: true,
    },

    location: {
      address: {
        type: String,
        required: [true, "Job address is required"],
        trim: true,
        maxlength: [300, "Address cannot exceed 300 characters"],
      },

      area: {
        type: String,
        required: [true, "Job area is required"],
        trim: true,
        maxlength: [100, "Area cannot exceed 100 characters"],
      },

      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
        maxlength: [100, "City cannot exceed 100 characters"],
      },

      state: {
        type: String,
        default: "Lagos",
        trim: true,
        maxlength: [100, "State cannot exceed 100 characters"],
      },

      coordinates: {
        type: [Number], // Stores [longitude, latitude] for GPS / geospatial mapping
        default: undefined,
      },
    },
    photos: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: [2048, "Photo URL is too long"],
        },
      ],
      default: [],
      validate: {
        validator: (photos) => photos.length <= 5,
        message: "A job cannot have more than 5 photos",
      },
    },

    status: {
      type: String,
      enum: [
        "open",
        "quote_accepted",
        "in_progress",
        "completed",
        "cancelled",
        "disputed",
      ],
      default: "open",
      index: true,
    },

    preferredStartDate: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    completionStatus: {
      type: String,
      enum: ["pending", "artisan_marked_complete", "customer_confirmed"],
      default: "pending",
    },

    artisanCompletedAt: { type: Date, default: null },
    artisanCompletionNote: { type: String, default: "", maxlength: 1000 },

    // Job Passport: immutable baseline accepted by the customer.
    agreement: {
      quoteID: { type: Schema.Types.ObjectId, ref: "Quote", default: null },
      labourAmount: { type: Number, min: 0, default: null },
      materialAmount: { type: Number, min: 0, default: null },
      additionalAmount: { type: Number, min: 0, default: 0 },
      changeAdjustmentTotal: { type: Number, default: 0 },
      totalAmount: { type: Number, min: 0, default: null },
      scope: { type: String, default: "", maxlength: 2000 },
      estimatedDuration: { type: String, default: "", maxlength: 100 },
      guaranteeTerms: { type: String, default: "", maxlength: 2000 },
      acceptedAt: { type: Date, default: null },
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "pending", "partially_paid", "paid", "refunded", "failed"],
      default: "unpaid",
    },
    progress: {
      stage: { type: String, enum: ["not_started", "materials", "work_started", "quality_check", "completion_submitted"], default: "not_started" },
      updatedAt: { type: Date, default: null },
    },
    changeRequests: { type: [changeRequestSchema], default: [] },
    completionEvidence: { type: [completionEvidenceSchema], default: [] },
    passportEvents: { type: [passportEventSchema], default: [] },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for common job queries.
jobSchema.index({ status: 1, category: 1, createdAt: -1 });
jobSchema.index({ customerID: 1, createdAt: -1 });
jobSchema.index({ artisanID: 1, status: 1, createdAt: -1 });

const Job = model("Job", jobSchema);

export default Job;
