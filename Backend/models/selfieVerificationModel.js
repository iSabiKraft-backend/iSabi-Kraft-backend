import mongoose from "mongoose";
import { schemaOptions, toJSONOptions } from "../utils/schemaOptions.js";

// One live-selfie attempt. The app asks the user to perform a few RANDOM actions in front of the
// camera (blink, turn head left, ...) and uploads one frame per action, in order, within a short
// time window. An admin then reviews the frames (manual review, as in the PRD).
const selfieVerificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["in_progress", "pending_review", "approved", "rejected", "expired"],
      default: "in_progress",
      index: true,
    },
    consentAt: { type: Date, required: true },

    challenges: [{ _id: false, id: String, instruction: String }],
    frames: [
      {
        _id: false,
        challenge: String,
        filename: String, // file inside the PRIVATE directory, never exposed
        mimeType: String,
        sizeBytes: Number,
        sha256: String,
        capturedAt: Date,
      },
    ],

    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
    purgeAfter: { type: Date }, // frames are deleted after this (data minimisation)
  },
  {
    ...schemaOptions,
    toJSON: {
      ...toJSONOptions,
      transform: (doc, ret) => {
        toJSONOptions.transform(doc, ret);
        // never expose file names / hashes — admins fetch images through the protected endpoint
        ret.frames = (ret.frames || []).map((f) => ({ challenge: f.challenge, capturedAt: f.capturedAt }));
        return ret;
      },
    },
  }
);

selfieVerificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("SelfieVerification", selfieVerificationSchema);
