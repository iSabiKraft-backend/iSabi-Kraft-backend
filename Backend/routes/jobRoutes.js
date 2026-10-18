import express from "express";
import {
  createJob,
  getOpenJobs,
  getMyJobs,
  getJobById,
  updateJob,
  cancelJob,
} from "../controllers/jobController.js";

import asyncHandler from "../utils/asyncHandler.js";
import {
  jobValidator,
  updateJobValidator,
  jobIdValidator,
  validateRequest,
  requireJobUpdateField,
} from "../validators/jobValidator.js";

const router = express.Router();

// Create a job
router.post(
  "/",
  jobValidator,
  validateRequest,
  asyncHandler(createJob)
);

// Get all open jobs
router.get("/open", asyncHandler(getOpenJobs));

// Get jobs created by the logged-in customer
router.get("/my-jobs", asyncHandler(getMyJobs));

// Get one job
router.get(
  "/:id",
  jobIdValidator,
  validateRequest,
  asyncHandler(getJobById)
);

// Update a job
router.patch(
  "/:id",
  jobIdValidator,
  updateJobValidator,
  validateRequest,
  requireJobUpdateField,
  asyncHandler(updateJob)
);
// Cancel a job
router.patch(
  "/:id/cancel",
  jobIdValidator,
  validateRequest,
  asyncHandler(cancelJob)
);

export default router;

