import mongoose from "mongoose";

const savedArtisanSchema = new mongoose.Schema(
  {
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    artisanID: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
savedArtisanSchema.index({ customerID: 1, artisanID: 1 }, { unique: true });

export default mongoose.model("SavedArtisan", savedArtisanSchema);
