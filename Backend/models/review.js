import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    jobID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      unique: true,
    },
    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    artisanID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
    edited: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("Review", reviewSchema);
