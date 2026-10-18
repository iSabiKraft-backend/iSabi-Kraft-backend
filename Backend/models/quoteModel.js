import mongoose from "mongoose";

const { Schema, model } = mongoose;

const quoteSchema = new Schema(
  {
    jobID: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    artisanID: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    labourAmount: {
      type: Number,
      required: [true, "Labour amount is required"],
      min: [0, "Labour amount cannot be negative"],
    },

    materialAmount: {
      type: Number,
      required: [true, "Material amount is required"],
      min: [0, "Material amount cannot be negative"],
    },

    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Total amount cannot be negative"],
    },

    scope: {
      type: String,
      required: [true, "Quote scope is required"],
      trim: true,
      minlength: [10, "Quote scope must be at least 10 characters"],
      maxlength: [2000, "Quote scope cannot exceed 2000 characters"],
    },

    estimatedDuration: {
      type: String,
      required: [true, "Estimated duration is required"],
      trim: true,
      maxlength: [100, "Estimated duration cannot exceed 100 characters"],
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "withdrawn"],
      default: "pending",
      index: true,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Prevent the same artisan from having multiple quotes
// for the same job.
quoteSchema.index(
  { jobID: 1, artisanID: 1 },
  { unique: true }
);

// Useful for finding pending quotes for a particular job.
quoteSchema.index({ jobID: 1, status: 1, createdAt: -1 });

// Calculate total from labour + materials before validation.
quoteSchema.pre("validate", function (next) {
  this.totalAmount = this.labourAmount + this.materialAmount;
  next();
});

const Quote = model("Quote", quoteSchema);

export default Quote;

