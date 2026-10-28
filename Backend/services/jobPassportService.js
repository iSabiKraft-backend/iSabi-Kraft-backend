import mongoose from "mongoose";
import Job from "../models/jobModel.js";
import { httpError } from "../utils/httpError.js";
import { notifyUser } from "./notificationService.js";

const PROGRESS_STAGES = ["materials", "work_started", "quality_check"];

const getPassportOrThrow = async (jobId) => {
  if (!mongoose.isValidObjectId(jobId)) throw httpError("Invalid job ID", 400);
  const job = await Job.findById(jobId)
    .populate("customerID", "firstName lastName")
    .populate("artisanID", "firstName lastName")
    .populate("agreement.quoteID")
    .populate("changeRequests.proposedBy", "firstName lastName")
    .populate("changeRequests.decidedBy", "firstName lastName")
    .populate("completionEvidence.submittedBy", "firstName lastName");
  if (!job) throw httpError("Job not found", 404);
  return job;
};

const assertParticipant = (job, user) => {
  const isCustomer = String(job.customerID?._id ?? job.customerID) === String(user.id);
  const isArtisan = String(job.artisanID?._id ?? job.artisanID) === String(user.id);
  if (!isCustomer && !isArtisan && user.role !== "admin") {
    throw httpError("You are not authorized to access this Job Passport", 403);
  }
  return { isCustomer, isArtisan };
};

const appendEvent = (job, type, actorID, message, metadata = {}) => {
  job.passportEvents.push({ type, actorID, message, metadata, createdAt: new Date() });
};

export const getJobPassport = async (jobId, user) => {
  const job = await getPassportOrThrow(jobId);
  assertParticipant(job, user);
  return job;
};

export const updateProgress = async (jobId, user, { stage, note }) => {
  const job = await getPassportOrThrow(jobId);
  const { isArtisan } = assertParticipant(job, user);
  if (!isArtisan) throw httpError("Only the assigned artisan can update job progress", 403);
  if (job.status !== "in_progress") throw httpError("Progress can only be updated while the job is in progress", 409);
  if (!PROGRESS_STAGES.includes(stage)) throw httpError("Invalid progress stage", 400);

  job.progress.stage = stage;
  job.progress.updatedAt = new Date();
  appendEvent(job, "progress_updated", user.id, note?.trim() || `Progress updated to ${stage}.`, { stage });
  await job.save();
  return job;
};

export const proposeChange = async (jobId, user, data) => {
  const job = await getPassportOrThrow(jobId);
  const { isArtisan } = assertParticipant(job, user);
  if (!isArtisan) throw httpError("Only the assigned artisan can propose a change", 403);
  if (!["quote_accepted", "in_progress"].includes(job.status)) throw httpError("Changes cannot be proposed in the current job state", 409);
  if (job.changeRequests.some((change) => change.status === "pending")) throw httpError("Resolve the pending change request before proposing another", 409);

  const priceAdjustment = Number(data.priceAdjustment ?? 0);
  if (!Number.isFinite(priceAdjustment)) throw httpError("Price adjustment must be a valid number", 400);
  if (priceAdjustment !== 0 && job.paymentStatus !== "unpaid") {
    throw httpError("Price changes are unavailable after payment has started; use a separately approved payment adjustment flow", 409);
  }
  if ((job.agreement.totalAmount ?? 0) + priceAdjustment < 0) throw httpError("The change would make the agreed total negative", 400);

  const change = job.changeRequests.create({
    proposedBy: user.id,
    description: data.description.trim(),
    priceAdjustment,
    scheduleAdjustment: data.scheduleAdjustment?.trim() ?? "",
  });
  job.changeRequests.push(change);
  appendEvent(job, "change_proposed", user.id, "Artisan proposed a change for customer approval.", { changeRequestID: change._id, priceAdjustment });
  await job.save();
  return change;
};

export const decideChange = async (jobId, changeId, user, decision) => {
  const job = await getPassportOrThrow(jobId);
  const { isCustomer } = assertParticipant(job, user);
  if (!isCustomer) throw httpError("Only the customer can decide a change request", 403);
  if (!mongoose.isValidObjectId(changeId)) throw httpError("Invalid change request ID", 400);
  if (!["approved", "rejected"].includes(decision)) throw httpError("Decision must be approved or rejected", 400);

  const change = job.changeRequests.id(changeId);
  if (!change) throw httpError("Change request not found", 404);
  if (change.status !== "pending") throw httpError("This change request has already been decided", 409);
  if (decision === "approved" && change.priceAdjustment !== 0 && job.paymentStatus !== "unpaid") {
    throw httpError("The payment state changed; this price adjustment can no longer be approved", 409);
  }

  change.status = decision;
  change.decidedBy = user.id;
  change.decidedAt = new Date();
  if (decision === "approved" && change.priceAdjustment !== 0) {
    job.agreement.totalAmount = Number((job.agreement.totalAmount + change.priceAdjustment).toFixed(2));
    job.agreement.changeAdjustmentTotal = Number((job.agreement.changeAdjustmentTotal + change.priceAdjustment).toFixed(2));
  }
  appendEvent(job, `change_${decision}`, user.id, `Customer ${decision} the proposed change.`, { changeRequestID: change._id });
  await job.save();
  return change;
};

export const submitCompletion = async (jobId, user, { note = "", evidence = [] }) => {
  const job = await getPassportOrThrow(jobId);
  const { isArtisan } = assertParticipant(job, user);
  if (!isArtisan) throw httpError("Only the assigned artisan can submit completion evidence", 403);
  if (job.status !== "in_progress" || job.completionStatus !== "pending") throw httpError("The job is not ready for completion submission", 409);
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.some((item) => typeof item?.url !== "string" || !item.url.trim())) {
    throw httpError("Submit at least one completion evidence URL", 400);
  }

  const now = new Date();
  job.completionEvidence.push(...evidence.map(({ url, note: evidenceNote }) => ({
    url: url.trim(),
    note: typeof evidenceNote === "string" ? evidenceNote.trim() : "",
    submittedBy: user.id,
    submittedAt: now,
  })));
  job.completionStatus = "artisan_marked_complete";
  job.artisanCompletedAt = now;
  job.artisanCompletionNote = note.trim();
  job.progress.stage = "completion_submitted";
  job.progress.updatedAt = now;
  appendEvent(job, "completion_submitted", user.id, note.trim() || "Artisan submitted completion evidence.", { evidenceCount: evidence.length });
  await job.save();

  await notifyUser({
    recipientID: job.customerID,
    senderID: user.id,
    type: "job_completion_submitted",
    title: "Job completion submitted",
    message: `The artisan has marked \"${job.title}\" as completed and submitted completion evidence for your review.`,
    jobID: job._id,
    metadata: { evidenceCount: evidence.length },
  });

  return job;
};
