import Job from "../models/jobModel.js";
import { uploadFilesToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

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
    photos = [],
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


export const addJobPhotos = async (jobID, customerID, files = []) => {
  const normalizedFiles = files === undefined ? [] : files;
  if (!Array.isArray(normalizedFiles)) throw createError("Invalid files payload", 400);

  const job = await Job.findById(jobID);
  if (!job) throw createError("Job not found", 404);
  if (String(job.customerID) !== String(customerID)) throw createError("You are not authorized to modify this job", 403);
  if (job.status !== "open") throw createError("Only open jobs can receive job request photos", 400);
  if (job.photos.length + normalizedFiles.length > 5) throw createError("A job cannot have more than 5 photos", 400);
  const media = await uploadFilesToCloudinary(normalizedFiles, { folder: `isabikraft/jobs/${job._id}/request` });
  job.photos.push(...media.filter((item) => item.resourceType === "image"));
  await job.save();
  return job;
};

export const addPassportPhotos = async (jobID, user, files = []) => {
  const normalizedFiles = files === undefined ? [] : files;
  if (!Array.isArray(normalizedFiles)) throw createError("Invalid files payload", 400);

  const job = await Job.findById(jobID);
  if (!job) throw createError("Job not found", 404);
  const participant = String(job.customerID) === String(user.id) || String(job.artisanID) === String(user.id);
  if (!participant && user.role !== "admin") throw createError("You are not authorized to modify this job passport", 403);
  if (job.passportPhotos.length + normalizedFiles.length > 5) throw createError("A job passport can have no more than 5 photos", 400);
  const media = await uploadFilesToCloudinary(normalizedFiles, { folder: `isabikraft/jobs/${job._id}/passport` });
  job.passportPhotos.push(...media.filter((item) => item.resourceType === "image"));
  await job.save();
  return job;
};

export const removeJobMedia = async (jobID, user, publicId) => {
  const job = await Job.findById(jobID);
  if (!job) throw createError("Job not found", 404);
  const participant = String(job.customerID) === String(user.id) || String(job.artisanID) === String(user.id);
  if (!participant && user.role !== "admin") throw createError("You are not authorized to modify this job", 403);

  const collections = [job.photos, job.passportPhotos, job.progress?.photos, job.videos, job.completionEvidence].filter(Boolean);
  let found = null;
  for (const collection of collections) {
    found = collection.find((item) => item.publicId === publicId);
    if (found) {
      collection.pull(found._id);
      break;
    }
  }
  if (!found) throw createError("Media not found", 404);
  await deleteFromCloudinary(found.publicId, found.resourceType);
  await job.save();
  return job;
};
