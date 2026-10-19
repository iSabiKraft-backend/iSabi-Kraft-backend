import Job from "../models/jobModel.js";

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Create a new job
export const createJob = async (customerID, data) => {
  const {
    title,
    description,
    category,
    location,
    photos,
    preferredStartDate,
  } = data;

  return Job.create({
    customerID,
    title,
    description,
    category,
    location,
    photos,
    preferredStartDate,
    passportEvents: [{
      type: "job_created",
      actorID: customerID,
      message: "Customer created the job brief.",
      createdAt: new Date(),
    }],
  });
};

// Get all open jobs
export const getOpenJobs = async () => {
  return Job.find({ status: "open" })
    .populate("customerID", "firstName lastName")
    .sort({ createdAt: -1 });
};

// Get jobs created by a specific customer
export const getMyJobs = async (customerID) => {
  return Job.find({ customerID }).sort({ createdAt: -1 });
};

// Get a single job by ID
export const getJobById = async (jobID, user) => {
  const job = await Job.findById(jobID)
    .populate("customerID", "firstName lastName")
    .populate("artisanID", "firstName lastName");

  if (!job) {
    throw createError("Job not found", 404);
  }

  const customerID = job.customerID?._id ?? job.customerID;
  const artisanID = job.artisanID?._id ?? job.artisanID;
  const isOwner = String(customerID) === String(user.id);
  const isAssignedArtisan = artisanID && String(artisanID) === String(user.id);
  const isArtisanBrowsingOpenJob = user.role === "artisan" && job.status === "open";
  if (!isOwner && !isAssignedArtisan && !isArtisanBrowsingOpenJob && user.role !== "admin") {
    throw createError("You are not authorized to view this job", 403);
  }

  return job;
};

// Update a job
export const updateJob = async (jobID, customerID, data) => {
  const job = await Job.findById(jobID);

  if (!job) {
    throw createError("Job not found", 404);
  }

  if (job.customerID.toString() !== customerID.toString()) {
    throw createError("You are not authorized to update this job", 403);
  }

  if (job.status !== "open") {
    throw createError("Only open jobs can be updated", 400);
  }

  const allowedFields = [
    "title",
    "description",
    "category",
    "location",
    "photos",
    "preferredStartDate",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      job[field] = data[field];
    }
  }

  job.passportEvents.push({
    type: "job_brief_updated",
    actorID: customerID,
    message: "Customer updated the job brief.",
  });

  await job.save();
  return job;
};

// Cancel a job
export const cancelJob = async (jobID, customerID) => {
  const job = await Job.findById(jobID);

  if (!job) {
    throw createError("Job not found", 404);
  }

  if (job.customerID.toString() !== customerID.toString()) {
    throw createError("You are not authorized to cancel this job", 403);
  }

  if (!["open", "quote_accepted"].includes(job.status)) {
    throw createError(
      "This job cannot be cancelled in its current status",
      400
    );
  }

  job.status = "cancelled";
  job.cancelledAt = new Date();
  job.passportEvents.push({
    type: "job_cancelled",
    actorID: customerID,
    message: "Customer cancelled the job.",
  });

  await job.save();
  return job;
};

