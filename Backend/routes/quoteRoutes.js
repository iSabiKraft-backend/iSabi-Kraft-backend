import express from "express";
import {
  createQuote,
  getJobQuotes,
  getQuoteById,
  acceptQuote,
  rejectQuote,
  withdrawQuote,
} from "../controllers/quoteController.js";

import asyncHandler from "../utils/asyncHandler.js";

import {
  quoteValidator,
  quoteIdValidator,
  validateRequest,
} from "../validators/quoteValidator.js";

import { param } from "express-validator";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireTermsAccepted } from "../middleware/termsMiddleware.js";

const router = express.Router();

// Validate the job ID used in the URL
const jobIdParamValidator = [
  param("jobId")
    .isMongoId()
    .withMessage("Invalid job ID"),
];

// Submit a quote for a job
router.post(
  "/jobs/:jobId",
  authenticateUser,
  authorizeRoles("artisan"),
  requireTermsAccepted,
  jobIdParamValidator,
  quoteValidator,
  validateRequest,
  asyncHandler(createQuote)
);

// Get all quotes for a specific job
router.get(
  "/jobs/:jobId",
  authenticateUser,
  authorizeRoles("customer"),
  jobIdParamValidator,
  validateRequest,
  asyncHandler(getJobQuotes)
);

// Get a single quote
router.get(
  "/:id",
  authenticateUser,
  quoteIdValidator,
  validateRequest,
  asyncHandler(getQuoteById)
);

// Accept a quote
router.patch(
  "/:id/accept",
  authenticateUser,
  authorizeRoles("customer"),
  requireTermsAccepted,
  quoteIdValidator,
  validateRequest,
  asyncHandler(acceptQuote)
);

// Reject a quote
router.patch(
  "/:id/reject",
  authenticateUser,
  authorizeRoles("customer"),
  quoteIdValidator,
  validateRequest,
  asyncHandler(rejectQuote)
);

// Withdraw a quote
router.patch(
  "/:id/withdraw",
  authenticateUser,
  authorizeRoles("artisan"),
  quoteIdValidator,
  validateRequest,
  asyncHandler(withdrawQuote)
);

export default router;

