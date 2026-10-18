import express from "express";
import { param } from "express-validator";
import {
  createReview,
  getArtisanReviews,
  getReviewById,
  updateReview,
  deleteReview,
} from "../controllers/reviewController.js";

import asyncHandler from "../utils/asyncHandler.js";

import {
  reviewValidator,
  updateReviewValidator,
  reviewIdValidator,
  validateRequest,
  requireReviewUpdateField,
} from "../validators/reviewValidator.js";

const router = express.Router();

// Validate the job ID in the URL
const jobIdParamValidator = [
  param("jobId")
    .isMongoId()
    .withMessage("Invalid job ID"),
];

// Validate the artisan ID in the URL
const artisanIdParamValidator = [
  param("artisanId")
    .isMongoId()
    .withMessage("Invalid artisan ID"),
];

// Create a review for a completed job
router.post(
  "/jobs/:jobId",
  jobIdParamValidator,
  reviewValidator,
  validateRequest,
  asyncHandler(createReview)
);

// Get all reviews for an artisan
router.get(
  "/artisan/:artisanId",
  artisanIdParamValidator,
  validateRequest,
  asyncHandler(getArtisanReviews)
);

// Get a single review
router.get(
  "/:id",
  reviewIdValidator,
  validateRequest,
  asyncHandler(getReviewById)
);

// Update a review
router.patch(
  "/:id",
  reviewIdValidator,
  updateReviewValidator,
  validateRequest,
  requireReviewUpdateField,
  asyncHandler(updateReview)
);

// Delete a review
router.delete(
  "/:id",
  reviewIdValidator,
  validateRequest,
  asyncHandler(deleteReview)
);

export default router;

