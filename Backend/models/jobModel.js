
import mongoose from "mongoose";

const { Schema, model } = mongoose;

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
