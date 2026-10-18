import mongoose from "mongoose";

const { Schema, model } = mongoose;

const reviewSchema = new Schema(
  {
    jobID: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    customerID: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    artisanID: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number between 1 and 5",
      },
    },

    comment: {
      type: String,
      trim: true,
      maxlength: [1000, "Review comment cannot exceed 1000 characters"],
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// A customer can submit only one review for a particular job.
reviewSchema.index(
  { jobID: 1, customerID: 1 },
  { unique: true }
);

// Useful when retrieving an artisan's reviews.
reviewSchema.index({ artisanID: 1, createdAt: -1 });

const Review = model("Review", reviewSchema);

export default Review;
