import express from "express";
import {
  createJob,
  getOpenJobs,
  getMyJobs,
  getJobById,
  updateJob,
  cancelJob,
  updateJobProgress,
  proposeJobChange,
  decideJobChange,
  submitJobCompletion,
} from "../controllers/jobController.js";

import asyncHandler from "../utils/asyncHandler.js";
import { body, param } from "express-validator";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireTermsAccepted } from "../middleware/termsMiddleware.js";
import {
  jobValidator,
  updateJobValidator,
  jobIdValidator,
  validateRequest,
  requireJobUpdateField,
} from "../validators/jobValidator.js";

const router = express.Router();

const progressValidator = [
  body("stage").isIn(["materials", "work_started", "quality_check"]).withMessage("Invalid progress stage"),
  body("note").optional().isString().trim().isLength({ max: 1000 }).withMessage("Progress note cannot exceed 1000 characters"),
];
const changeProposalValidator = [
  body("description").isString().trim().isLength({ min: 5, max: 2000 }).withMessage("Describe the proposed change (5–2000 characters)"),
  body("priceAdjustment").optional().isFloat().withMessage("Price adjustment must be a number"),
  body("scheduleAdjustment").optional().isString().trim().isLength({ max: 500 }).withMessage("Schedule adjustment cannot exceed 500 characters"),
];
const changeDecisionValidator = [
  param("changeId").isMongoId().withMessage("Invalid change request ID"),
  body("decision").isIn(["approved", "rejected"]).withMessage("Decision must be approved or rejected"),
];
const completionValidator = [
  body("note").optional().isString().trim().isLength({ max: 1000 }).withMessage("Completion note cannot exceed 1000 characters"),
  body("evidence").isArray({ min: 1 }).withMessage("At least one completion evidence item is required"),
  body("evidence.*.url").isURL({ require_protocol: true }).withMessage("Evidence URL must be valid"),
  body("evidence.*.note").optional().isString().trim().isLength({ max: 1000 }),
];

// Create a job
router.post(
  "/",
  authenticateUser,
  authorizeRoles("customer"),
  requireTermsAccepted,
  jobValidator,
  validateRequest,
  asyncHandler(createJob)
);

// Get all open jobs
router.get("/open", authenticateUser, authorizeRoles("artisan"), asyncHandler(getOpenJobs));

// Get jobs created by the logged-in customer
router.get("/my-jobs", authenticateUser, authorizeRoles("customer"), asyncHandler(getMyJobs));

// Get one job
router.get(
  "/:id",
  authenticateUser,
  jobIdValidator,
  validateRequest,
  asyncHandler(getJobById)
);

// Job Passport lifecycle
router.patch(
  "/:id/progress",
  authenticateUser,
  authorizeRoles("artisan"),
  requireTermsAccepted,
  jobIdValidator,
  progressValidator,
  validateRequest,
  asyncHandler(updateJobProgress)
);

router.post(
  "/:id/changes",
  authenticateUser,
  authorizeRoles("artisan"),
  requireTermsAccepted,
  jobIdValidator,
  changeProposalValidator,
  validateRequest,
  asyncHandler(proposeJobChange)
);

router.patch(
  "/:id/changes/:changeId/decision",
  authenticateUser,
  authorizeRoles("customer"),
  requireTermsAccepted,
  jobIdValidator,
  changeDecisionValidator,
  validateRequest,
  asyncHandler(decideJobChange)
);

router.post(
  "/:id/completion",
  authenticateUser,
  authorizeRoles("artisan"),
  requireTermsAccepted,
  jobIdValidator,
  completionValidator,
  validateRequest,
  asyncHandler(submitJobCompletion)
);

// Update a job
router.patch(
  "/:id",
  authenticateUser,
  authorizeRoles("customer"),
  jobIdValidator,
  updateJobValidator,
  validateRequest,
  requireJobUpdateField,
  asyncHandler(updateJob)
);
// Cancel a job
router.patch(
  "/:id/cancel",
  authenticateUser,
  authorizeRoles("customer"),
  jobIdValidator,
  validateRequest,
  asyncHandler(cancelJob)
);

export default router;

