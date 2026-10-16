import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

const termsSchema = new mongoose.Schema(
  {
    version: { type: String, required: true, unique: true }, // e.g. "v1.0"
    content: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    publishedAt: { type: Date, default: Date.now },
  },
  schemaOptions
);

export default mongoose.model("Terms", termsSchema);
