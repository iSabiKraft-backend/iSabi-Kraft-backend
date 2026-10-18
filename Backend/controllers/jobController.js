import * as jobService from "../services/jobService.js";

/**
 * Create a new job
 * Customer only
 */
export const createJob = async (req, res) => {
  const job = await jobService.createJob(req.user.id, req.body);

  return res.status(201).json({
    success: true,
    message: "Job created successfully",
    data: job,
  });
};

/**
 * Get all open jobs
 * Used by artisans to discover available jobs
 */
export const getOpenJobs = async (_req, res) => {
  const jobs = await jobService.getOpenJobs();

  return res.status(200).json({
    success: true,
    count: jobs.length,
    data: jobs,
  });
};

/**
 * Get all jobs created by the logged-in customer
 */
export const getMyJobs = async (req, res) => {
  const jobs = await jobService.getMyJobs(req.user.id);

  return res.status(200).json({
    success: true,
    count: jobs.length,
    data: jobs,
  });
};

/**
 * Get a single job
 */
export const getJobById = async (req, res) => {
  const job = await jobService.getJobById(req.params.id);

  return res.status(200).json({
    success: true,
    data: job,
  });
};

/**
 * Update a job
 */
export const updateJob = async (req, res) => {
  const job = await jobService.updateJob(
    req.params.id,
    req.user.id,
    req.body
  );

  return res.status(200).json({
    success: true,
    message: "Job updated successfully",
    data: job,
  });
};

/**
 * Cancel a job
 */
export const cancelJob = async (req, res) => {
  const job = await jobService.cancelJob(
    req.params.id,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    message: "Job cancelled successfully",
    data: job,
  });
};

