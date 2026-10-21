import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// Mandatory evidence of past work (PRD §4: "Mandatory photo/video
// portfolios of past work"). Append-only from the controller's point of
// view — see artisanController.addPortfolioItem — so an artisan can't
// silently rewrite evidence a customer is relying on.
const portfolioItemSchema = new mongoose.Schema(
  {
    artisanProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "ArtisanProfile", required: true, index: true },
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: null },
    type: { type: String, enum: ["photo", "video"], required: true },
    caption: { type: String, maxlength: 200, trim: true, default: null },
  },
  schemaOptions
);

export default mongoose.model("PortfolioItem", portfolioItemSchema);
