import * as jobService from "../services/jobService.js";
import * as jobPassportService from "../services/jobPassportService.js";

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
  const job = await jobPassportService.getJobPassport(req.params.id, req.user);

  return res.status(200).json({
    success: true,
    data: job,
  });
};

export const updateJobProgress = async (req, res) => {
  const job = await jobPassportService.updateProgress(req.params.id, req.user, req.body);
  return res.status(200).json({ success: true, message: "Job progress updated.", data: job });
};

export const proposeJobChange = async (req, res) => {
  const change = await jobPassportService.proposeChange(req.params.id, req.user, req.body);
  return res.status(201).json({ success: true, message: "Change request submitted for approval.", data: change });
};

export const decideJobChange = async (req, res) => {
  const change = await jobPassportService.decideChange(req.params.id, req.params.changeId, req.user, req.body.decision);
  return res.status(200).json({ success: true, message: `Change request ${change.status}.`, data: change });
};

export const submitJobCompletion = async (req, res) => {
  const job = await jobPassportService.submitCompletion(req.params.id, req.user, req.body);
  return res.status(200).json({ success: true, message: "Completion evidence submitted for customer review.", data: job });
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

