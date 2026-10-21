import mongoose from "mongoose";
import Dispute from "../models/dispute.js";
import Escrow from "../models/escrow.js";
import Job from "../models/jobModel.js";
import { httpError } from "../utils/httpError.js";
import asyncHandler from "../utils/asyncHandler.js";

const isParticipant = (job, userId) =>
  String(job.customerID) === String(userId) || String(job.artisanID) === String(userId);

const getDisputeOrThrow = async (id, populateJob = false) => {
  if (!mongoose.isValidObjectId(id)) throw httpError("Invalid dispute ID", 400);
  const query = Dispute.findById(id);
  if (populateJob) query.populate("job", "title status customerID artisanID");
  const dispute = await query;
  if (!dispute) throw httpError("Dispute not found", 404);
  return dispute;
};

export const createDispute = asyncHandler(async (req, res) => {
  const { jobId, reason, description, evidence = [] } = req.body ?? {};
  if (!mongoose.isValidObjectId(jobId)) throw httpError("A valid job ID is required", 400);
  if (typeof reason !== "string" || !reason.trim()) throw httpError("A dispute reason is required", 400);
  if (typeof description !== "string" || !description.trim()) throw httpError("A dispute description is required", 400);
  if (!Array.isArray(evidence) || evidence.some((item) => !item || typeof item.url !== "string" || !item.url.trim())) {
    throw httpError("Evidence must be an array of items with a URL", 400);
  }

  const job = await Job.findById(jobId);
  if (!job) throw httpError("Job not found", 404);
  if (!isParticipant(job, req.user.id)) throw httpError("You are not a participant in this job", 403);
  if (!job.artisanID || !["in_progress", "completed", "disputed"].includes(job.status)) {
    throw httpError("A dispute can only be opened for an active or completed job", 409);
  }

  const existing = await Dispute.findOne({ job: job._id, status: { $in: ["open", "under_review"] } });
  if (existing) throw httpError("A dispute is already open for this job", 409);

  const dispute = await Dispute.create({
    job: job._id,
    customerId: job.customerID,
    artisanId: job.artisanID,
    raisedBy: req.user.id,
    reason: reason.trim(),
    description: description.trim(),
    evidence: evidence.map(({ url, note }) => ({ url: url.trim(), ...(typeof note === "string" && { note: note.trim() }) })),
  });

  const previousStatus = job.status;
  job.status = "disputed";
  job.passportEvents.push({
    type: "dispute_opened",
    actorID: req.user.id,
    message: "A participant opened a dispute; work and payout actions are paused.",
    metadata: { disputeID: dispute._id, previousStatus },
  });
  await job.save();
  await Escrow.updateOne(
    { jobId: job._id, status: { $in: ["pending", "payment_confirmed", "material_payment_made"] } },
    { $set: { status: "disputed" } }
  );

  return res.status(201).json({ success: true, message: "Dispute opened", data: dispute });
});

export const disputeStatus = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = {};

  if (req.user.role !== "admin") {
    const jobs = await Job.find({
      $or: [{ customerID: req.user.id }, { artisanID: req.user.id }],
    }).distinct("_id");
    filter.job = { $in: jobs };
  }
  if (req.query.status !== undefined) {
    const statuses = ["open", "under_review", "resolved", "dismissed"];
    if (!statuses.includes(req.query.status)) throw httpError("Invalid dispute status", 400);
    filter.status = req.query.status;
  }

  const [items, total] = await Promise.all([
    Dispute.find(filter).populate("job", "title status").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Dispute.countDocuments(filter),
  ]);
  return res.json({ success: true, data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const getDispute = asyncHandler(async (req, res) => {
  const dispute = await getDisputeOrThrow(req.params.id, true);
  if (req.user.role !== "admin" && !isParticipant(dispute.job, req.user.id)) {
    throw httpError("You are not authorized to view this dispute", 403);
  }
  return res.json({ success: true, data: dispute });
});

export const addDisputeEvidence = asyncHandler(async (req, res) => {
  const { evidence } = req.body ?? {};
  if (!Array.isArray(evidence) || !evidence.length || evidence.some((item) => !item || typeof item.url !== "string" || !item.url.trim())) {
    throw httpError("Provide evidence items with a URL", 400);
  }

  const dispute = await getDisputeOrThrow(req.params.id, true);
  if (req.user.role !== "admin" && !isParticipant(dispute.job, req.user.id)) {
    throw httpError("You are not authorized to add evidence to this dispute", 403);
  }
  if (!["open", "under_review"].includes(dispute.status)) throw httpError("This dispute is closed", 409);

  dispute.evidence.push(...evidence.map(({ url, note }) => ({ url: url.trim(), ...(typeof note === "string" && { note: note.trim() }) })));
  await dispute.save();
  dispute.job.passportEvents.push({
    type: "dispute_evidence_added",
    actorID: req.user.id,
    message: "Evidence was added to the dispute.",
    metadata: { disputeID: dispute._id, evidenceCount: evidence.length },
  });
  await dispute.job.save();
  return res.json({ success: true, data: dispute });
});
