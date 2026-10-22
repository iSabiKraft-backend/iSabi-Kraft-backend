import mongoose from "mongoose";
import fs from "node:fs/promises";
import path from "node:path";
import Job from "../models/jobModel.js";
import { httpError } from "../utils/httpError.js";
import { completionEvidenceDir } from "../middleware/completionEvidenceUploadMiddleware.js";

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

const passportResponse = (job) => {
  const result = job.toObject();
  result.completionEvidence = result.completionEvidence.map((item) => ({
    _id: item._id,
    url: item.url ?? null,
    note: item.note,
    submittedBy: item.submittedBy,
    submittedAt: item.submittedAt,
    ...(item.filename && {
      downloadUrl: `/api/jobs/${job._id}/completion/evidence/${item._id}`,
    }),
  }));
  return result;
};

export const getJobPassport = async (jobId, user) => {
  const job = await getPassportOrThrow(jobId);
  assertParticipant(job, user);
  return passportResponse(job);
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

export const submitCompletion = async (jobId, user, { note = "", files = [] }) => {
  try {
    if (!mongoose.isValidObjectId(jobId)) throw httpError("Invalid job ID", 400);
    if (!Array.isArray(files) || files.length === 0 || files.length > 5) throw httpError("Upload between one and five completion evidence images", 400);

    const now = new Date();
    const evidence = files.map((file) => ({
      filename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sha256: file.sha256,
      note: typeof file.note === "string" ? file.note.trim() : "",
      submittedBy: user.id,
      submittedAt: now,
    }));
    const event = {
      type: "completion_submitted",
      actorID: user.id,
      message: note.trim() || "Artisan submitted completion evidence.",
      metadata: { evidenceCount: files.length },
      createdAt: now,
    };
    const job = await Job.findOneAndUpdate(
      { _id: jobId, artisanID: user.id, status: "in_progress", completionStatus: "pending" },
      {
        $set: {
          completionStatus: "artisan_marked_complete",
          artisanCompletedAt: now,
          artisanCompletionNote: note.trim(),
          "progress.stage": "completion_submitted",
          "progress.updatedAt": now,
        },
        $push: {
          completionEvidence: { $each: evidence },
          passportEvents: event,
        },
      },
      { new: true, runValidators: true }
    );
    if (!job) throw httpError("The job is no longer ready for completion submission", 409);
    return passportResponse(job);
  } catch (error) {
    await Promise.all((Array.isArray(files) ? files : []).map((file) => fs.rm(file.path, { force: true }).catch(() => {})));
    throw error;
  }
};

export const getCompletionEvidenceFile = async (jobId, evidenceId, user) => {
  const job = await getPassportOrThrow(jobId);
  assertParticipant(job, user);
  if (!mongoose.isValidObjectId(evidenceId)) throw httpError("Invalid evidence ID", 400);
  const evidence = job.completionEvidence.id(evidenceId);
  if (!evidence) throw httpError("Completion evidence not found", 404);
  if (!evidence.filename) throw httpError("This evidence is an external legacy link", 404);

  const root = await fs.realpath(path.resolve(completionEvidenceDir(job._id)));
  const candidate = path.resolve(root, path.basename(evidence.filename));
  const file = await fs.realpath(candidate).catch(() => null);
  if (!file || !file.startsWith(`${root}${path.sep}`)) throw httpError("Completion evidence file not found", 404);
  return { file, mimeType: evidence.mimeType };
};
