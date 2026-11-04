
import { Router } from "express";

import asyncHandler from "../utils/asyncHandler.js";

import {
  requireServiceApiKey,
} from "../middleware/serviceApiKey.js";

import {
  getMatchingCandidates,
} from "../controllers/aiMatching.controller.js";

const router = Router();

// Private server-to-server endpoint
router.post(
  "/candidates",
  requireServiceApiKey,
  asyncHandler(getMatchingCandidates)
);

export default router;
