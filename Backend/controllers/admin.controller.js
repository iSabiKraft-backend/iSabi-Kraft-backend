import mongoose from "mongoose";
import Dispute from "../models/dispute.js";
import User from "../models/user.js";
import Job from "../models/job.js";
import Escrow from "../models/escrow.js";
import Review from "../models/review.js";
import Payment from "../models/payment.js";
import Category from "../models/category.js";
import AdminAudit from "../models/adminAudit.js";
import { sendVerificationEmail } from "../services/notificationService.js";
import * as supabaseAdmin from "../services/supabaseAdmin.js";
import {
  reconcilePendingTransfers,
  reconcileTransfer,
  resolveDispute,
  approveMaterialRelease,
  rejectMaterialRelease,
  approveBalanceRelease,
  rejectBalanceRelease,
} from "../services/escrowService.js";
import { httpError } from "../utils/httpError.js";
import { objectId, text } from "../utils/validate.js";
import {
  enqueueArtisanSync,
  artisanSyncQueueDiagnostics,
  retryFailedArtisanSyncJobs,
  drainArtisanSyncQueue,
} from "../services/artisanSyncQueue.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pageArgs = (query) => ({
  page: Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1)),
  limit: Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 20)),
});
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const audit = (req, action, targetType, targetID, details = {}) =>
  AdminAudit.create({ adminID: req.user._id, action, targetType, targetID: String(targetID), details });
const safeUser = (u) => u ? {
  id: u._id, ref: u.supabaseId, fullName: u.fullName, email: u.email,
  phone: u.phone, role: u.role, photoUrl: u.avatarUrl, joinedAt: u.createdAt,
  verified: u.verified, rating: u.ratingAvg, ratingCount: u.ratingCount,
  location: [u.artisan?.state, u.artisan?.lga].filter(Boolean).join(", "),
} : null;

export const listVerifications = async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const status = req.query.status ? String(req.query.status) : "all";
  const allowed = ["all", "pending", "approved", "rejected", "info_requested"];
  if (!allowed.includes(status)) throw httpError(400, "Invalid verification status");
  const rows = await supabaseAdmin.listVerifications({ status, page, limit });
  const [profiles, mongoUsers, auditRows] = await Promise.all([
    supabaseAdmin.profilesByIds(rows.map((r) => r.user_id)),
    User.find({ supabaseId: { $in: rows.map((r) => r.user_id) } }).select("supabaseId email artisan.trade").lean(),
    AdminAudit.find({ targetType: "verification", targetID: { $in: rows.map((r) => r.user_id) } })
      .sort({ createdAt: -1 }).populate("adminID", "fullName email").lean(),
  ]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const userById = new Map(mongoUsers.map((u) => [u.supabaseId, u]));
  const reviewedByMap = new Map();
  auditRows.forEach((a) => { if (!reviewedByMap.has(a.targetID)) reviewedByMap.set(a.targetID, a.adminID); });
  const verifications = await Promise.all(rows.map(async (r) => {
    const p = byId.get(r.user_id) || {};
    const u = userById.get(r.user_id) || {};
    return {
      id: r.id, ref: r.user_id, userId: r.user_id,
      fullName: p.full_name || null, email: u.email || null, phone: p.phone || null,
      trade: u.artisan?.trade || null, location: [p.state, p.lga].filter(Boolean).join(", "),
      submittedAt: r.submitted_at, status: r.status,
      reason: r.rejection_reason || null,
      reviewedBy: reviewedByMap.get(r.user_id) || null,
      reviewedAt: r.reviewed_at,
      frontUrl: await supabaseAdmin.signedUrl("identity-docs", r.front_path),
      backUrl: await supabaseAdmin.signedUrl("identity-docs", r.back_path),
      selfieUrl: await supabaseAdmin.signedUrl("identity-docs", r.selfie_path),
    };
  }));
  const counts = await supabaseAdmin.verificationCounts();
  res.json({ verifications, counts: {
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    pending: counts.pending || 0, approved: counts.approved || 0,
    rejected: counts.rejected || 0, info_requested: counts.info_requested || 0,
    awaiting: counts.pending || 0,
  }, page, limit });
};

export const getVerification = async (req, res) => {
  const { userId } = req.params;
  if (!UUID.test(userId)) throw httpError(400, "Invalid user id");
  const [verification, profiles] = await Promise.all([
    supabaseAdmin.verificationByUser(userId),
    supabaseAdmin.artisanProfile(userId),
  ]);
  if (!verification) throw httpError(404, "Verification record not found");
  const profile = profiles.profile || {};
  const artisan = profiles.artisan || {};
  const history = await AdminAudit.find({ targetType: "verification", targetID: userId })
    .sort({ createdAt: -1 }).limit(50).populate("adminID", "fullName email").lean();
  res.json({ verification: {
    id: verification.id, ref: userId, userId,
    fullName: profile.full_name || null, phone: profile.phone || null,
    location: [profile.state, profile.lga, profile.address].filter(Boolean).join(", "),
    trade: artisan.trade || null, experience: artisan.experience || null,
    bio: artisan.bio || null, status: verification.status,
    reason: verification.rejection_reason || null,
    submittedAt: verification.submitted_at, reviewedAt: verification.reviewed_at,
    frontUrl: await supabaseAdmin.signedUrl("identity-docs", verification.front_path),
    backUrl: await supabaseAdmin.signedUrl("identity-docs", verification.back_path),
    selfieUrl: await supabaseAdmin.signedUrl("identity-docs", verification.selfie_path),
  }, history });
};

export const reviewVerification = async (req, res) => {
  const { userId } = req.params;
  if (!UUID.test(userId)) throw httpError(400, "Invalid user id");
  const status = req.body.status;
  if (!["approved", "rejected", "info_requested"].includes(status))
    throw httpError(400, "Status must be approved, rejected or info_requested");
  const reason = status === "approved" ? null : text(req.body.reason, {
    label: status === "info_requested" ? "Information request message" : "Rejection reason",
    max: 500,
  });
  const verification = await supabaseAdmin.setVerificationStatus(userId, status, reason);
  await audit(req, `verification_${status}`, "verification", userId, { status, reason });
  const artisanUser = await User.findOne({ supabaseId: userId }).select("email fullName").lean();
  let notification = { sent: false, reason: "Email notifications are not configured" };
  if (artisanUser?.email) {
    try {
      notification = await sendVerificationEmail({
        to: artisanUser.email, name: artisanUser.fullName, status, message: reason,
      });
    } catch (error) {
      console.error("Verification notification failed:", error.message);
      notification = { sent: false, reason: "Email delivery failed" };
    }
  }
  await enqueueArtisanSync(userId);
  const worker = await drainArtisanSyncQueue({ maxJobs: 5 });
  const queue = await artisanSyncQueueDiagnostics();
  res.status(202).json({
    verification, notification,
    resubmissionAllowed: status === "info_requested",
    synchronizationQueued: queue.pending > 0 || queue.processing > 0,
    processedImmediately: worker.processed, queue,
  });
};

export const listDisputes = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  const { page, limit } = pageArgs(req.query);
  const [rows, total] = await Promise.all([
    Dispute.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate("jobID", "title status category")
      .populate("raisedBy", "fullName email")
      .populate({ path: "escrowID", populate: [
        { path: "customerID", select: "fullName email" },
        { path: "artisanID", select: "fullName email" },
      ] }).lean(),
    Dispute.countDocuments(filter),
  ]);
  res.json({ disputes: rows.map((d) => ({
    id: d._id, ref: `DSP-${String(d._id).slice(-6).toUpperCase()}`,
    jobId: d.jobID?._id, jobRef: d.jobID ? `JOB-${String(d.jobID._id).slice(-6).toUpperCase()}` : null,
    jobTitle: d.jobID?.title, jobStatus: d.jobID?.status,
    customer: d.escrowID?.customerID ? { id: d.escrowID.customerID._id, name: d.escrowID.customerID.fullName } : null,
    artisan: d.escrowID?.artisanID ? { id: d.escrowID.artisanID._id, name: d.escrowID.artisanID.fullName } : null,
    amount: d.escrowID?.totalAmount, raisedBy: d.raisedBy,
    reason: d.reason, status: d.status, openedAt: d.createdAt,
    resolvedAt: d.resolvedAt, resolution: d.resolution, adminNote: d.adminNote || null,
  })), total, page, limit });
};

export const getDispute = async (req, res) => {
  const dispute = await Dispute.findById(objectId(req.params.id, "dispute id"))
    .populate("jobID")
    .populate("raisedBy", "fullName email phone")
    .populate("evidence.addedBy", "fullName role")
    .populate("response.respondedBy", "fullName role")
    .populate("adminNotes.adminID", "fullName email")
    .populate({ path: "escrowID", populate: [
      { path: "customerID", select: "fullName email phone" },
      { path: "artisanID", select: "fullName email phone" },
    ] });
  if (!dispute) throw httpError(404, "Dispute not found");
  res.json({ dispute });
};

export const startDisputeReview = async (req, res) => {
  const dispute = await Dispute.findById(objectId(req.params.id, "dispute id"));
  if (!dispute) throw httpError(404, "Dispute not found");
  if (!["open", "in_review"].includes(dispute.status)) throw httpError(409, "Dispute is already resolved");
  dispute.status = "in_review";
  await dispute.save();
  await audit(req, "dispute_started_review", "dispute", dispute._id);
  res.json({ dispute });
};

export const addDisputeNote = async (req, res) => {
  const note = text(req.body.note, { label: "Note", max: 1000 });
  const dispute = await Dispute.findById(objectId(req.params.id, "dispute id"));
  if (!dispute) throw httpError(404, "Dispute not found");
  if (dispute.status === "resolved") throw httpError(409, "Dispute is already resolved");
  dispute.adminNotes.push({ note, adminID: req.user._id, createdAt: new Date() });
  await dispute.save();
  await audit(req, "dispute_note_added", "dispute", dispute._id);
  res.status(201).json({ dispute });
};

export const resolve = async (req, res) => {
  const resolution = req.body.resolution;
  if (!["release", "refund"].includes(resolution))
    throw httpError(400, "Resolution must be release or refund");
  const note = text(req.body.adminNote, { label: "Admin note", max: 1000, required: false });
  const dispute = await resolveDispute(objectId(req.params.id, "dispute id"), resolution, note);
  await audit(req, `dispute_${resolution}`, "dispute", dispute._id, { resolution });
  res.json({ dispute });
};

export const listArtisans = async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = { role: "artisan" };
  const requestedStatus = req.query.status ? String(req.query.status) : "";
  if (requestedStatus && requestedStatus !== "all") {
    const status = requestedStatus === "awaiting" || requestedStatus === "unverified" ? "pending" : requestedStatus;
    if (!["approved", "pending", "rejected", "info_requested"].includes(status)) {
      throw httpError(400, "Invalid artisan status filter");
    }
    const ids = await supabaseAdmin.verificationUserIds(status);
    filter.supabaseId = { $in: ids };
  }
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), "i");
    filter.$or = [{ fullName: rx }, { email: rx }, { phone: rx }, { "artisan.trade": rx }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const ids = users.map((u) => u.supabaseId).filter(Boolean);
  const [profiles, verifications] = await Promise.all([
    supabaseAdmin.profilesByIds(ids),
    Promise.all(ids.map((id) => supabaseAdmin.artisanVerification(id))),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const items = users.map((u, i) => {
    const p = profileMap.get(u.supabaseId) || {};
    const v = verifications[i] || {};
    return {
      id: u._id, ref: u.supabaseId, fullName: p.full_name || u.fullName,
      email: u.email, phone: p.phone || u.phone, trade: u.artisan?.trade || null,
      location: [p.state || u.artisan?.state, p.lga || u.artisan?.lga].filter(Boolean).join(", "),
      verificationStatus: v.status || (u.verified ? "approved" : "pending"),
      joinedAt: u.createdAt, jobsCompleted: 0,
      rating: u.ratingAvg || 0, ratingCount: u.ratingCount || 0,
    };
  });
  const [approved, totalArtisans, verificationCounts, completedCounts] = await Promise.all([
    User.countDocuments({ role: "artisan", verified: true }),
    User.countDocuments({ role: "artisan" }),
    supabaseAdmin.verificationCounts(),
    Job.aggregate([{ $match: { status: "completed", artisanID: { $in: users.map((u) => u._id) } } }, { $group: { _id: "$artisanID", count: { $sum: 1 } } }]),
  ]);
  const completedByArtisan = new Map(completedCounts.map((r) => [String(r._id), r.count]));
  items.forEach((item) => { item.jobsCompleted = completedByArtisan.get(String(item.id)) || 0; });
  res.json({ artisans: items, counts: {
    total: totalArtisans, approved, awaiting: verificationCounts.pending || 0,
    rejected: verificationCounts.rejected || 0,
  }, total, page, limit });
};

export const getArtisan = async (req, res) => {
  const id = objectId(req.params.id, "artisan id");
  const user = await User.findOne({ _id: id, role: "artisan" }).lean();
  if (!user) throw httpError(404, "Artisan not found");
  const [supabase, verification, jobs, disputes, reviews] = await Promise.all([
    supabaseAdmin.artisanProfile(user.supabaseId),
    supabaseAdmin.artisanVerification(user.supabaseId),
    Job.find({ $or: [{ artisanID: id }, { "quotes.artisanID": id }] }).sort({ createdAt: -1 }).limit(10).select("title status category createdAt").lean(),
    Dispute.find().sort({ createdAt: -1 }).limit(100).populate("jobID", "artisanID").lean(),
    Review.find({ artisanID: id }).sort({ createdAt: -1 }).limit(10).populate("customerID", "fullName").lean(),
  ]);
  const relevantDisputes = disputes.filter((d) => String(d.jobID?.artisanID) === String(id)).slice(0, 10);
  const p = supabase.profile || {}, a = supabase.artisan || {};
  res.json({ artisan: {
    ...safeUser(user), fullName: p.full_name || user.fullName, phone: p.phone || user.phone,
    location: [p.state, p.lga, p.address].filter(Boolean).join(", "),
    photoUrl: p.avatar_url || user.avatarUrl, trade: a.trade || user.artisan?.trade,
    bio: a.bio || user.artisan?.bio, experience: a.experience || user.artisan?.experienceYears,
    serviceAreas: [p.state, p.lga].filter(Boolean), portfolio: user.artisan?.portfolio || [],
    verification: verification || { status: user.verified ? "approved" : "pending" },
    ratingSummary: { average: user.ratingAvg || 0, count: user.ratingCount || 0 },
    jobs: jobs.map((j) => ({ id: j._id, ref: `JOB-${String(j._id).slice(-6).toUpperCase()}`, title: j.title, status: j.status, category: j.category, createdAt: j.createdAt })),
    disputes: relevantDisputes.map((d) => ({ id: d._id, status: d.status, reason: d.reason, createdAt: d.createdAt })),
    reviews,
  } });
};

export const listCustomers = async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = { role: "customer" };
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), "i");
    filter.$or = [{ fullName: rx }, { email: rx }, { phone: rx }];
  }
  const [activeIds, disputeCustomerIds] = await Promise.all([
    Job.distinct("customerID", { status: { $nin: ["completed", "cancelled"] } }),
    (async () => {
      const open = await Dispute.find({ status: { $in: ["open", "in_review"] } }).select("escrowID").lean();
      const escrows = await Escrow.find({ _id: { $in: open.map((d) => d.escrowID) } }).select("customerID").lean();
      return escrows.map((e) => String(e.customerID));
    })(),
  ]);
  if (req.query.filter === "active") filter._id = { $in: activeIds };
  if (req.query.filter === "disputes") filter._id = { $in: disputeCustomerIds };
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const profiles = await supabaseAdmin.profilesByIds(users.map((u) => u.supabaseId));
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const active = new Set(activeIds.map(String));
  const disputes = new Set(disputeCustomerIds);
  const customers = users.map((u) => {
    const p = profileMap.get(u.supabaseId) || {};
    return {
      id: u._id, ref: `CUS-${String(u._id).slice(-6).toUpperCase()}`,
      fullName: p.full_name || u.fullName, email: u.email,
      phone: p.phone || u.phone, photoUrl: p.avatar_url || u.avatarUrl,
      location: [p.state, p.lga, p.address].filter(Boolean).join(", "),
      joinedAt: u.createdAt,
      hasActiveJobs: active.has(String(u._id)), hasOpenDisputes: disputes.has(String(u._id)),
      jobsCount: 0,
    };
  });
  const jobCounts = await Job.aggregate([
    { $match: { customerID: { $in: users.map((u) => u._id) } } },
    { $group: { _id: "$customerID", count: { $sum: 1 } } },
  ]);
  const jobCountMap = new Map(jobCounts.map((r) => [String(r._id), r.count]));
  customers.forEach((customer) => { customer.jobsCount = jobCountMap.get(String(customer.id)) || 0; });
  const [withActiveJobs, withOpenDisputes] = await Promise.all([
    User.countDocuments({ _id: { $in: activeIds }, role: "customer" }),
    User.countDocuments({ _id: { $in: disputeCustomerIds }, role: "customer" }),
  ]);
  res.json({ customers, counts: { total: await User.countDocuments({ role: "customer" }), withActiveJobs, withOpenDisputes }, total, page, limit });
};

export const getCustomer = async (req, res) => {
  const user = await User.findOne({ _id: objectId(req.params.id, "customer id"), role: "customer" }).lean();
  if (!user) throw httpError(404, "Customer not found");
  const [profiles, jobs, disputes] = await Promise.all([
    supabaseAdmin.profilesByIds([user.supabaseId]),
    Job.find({ customerID: user._id }).sort({ createdAt: -1 }).limit(20).populate("artisanID", "fullName").lean(),
    (async () => {
      const ds = await Dispute.find().sort({ createdAt: -1 }).limit(100).populate("jobID", "customerID").lean();
      return ds.filter((d) => String(d.jobID?.customerID) === String(user._id)).slice(0, 20);
    })(),
  ]);
  const p = profiles[0] || {};
  res.json({ customer: {
    ...safeUser(user), fullName: p.full_name || user.fullName,
    phone: p.phone || user.phone, photoUrl: p.avatar_url || user.avatarUrl,
    location: [p.state, p.lga, p.address].filter(Boolean).join(", "),
    jobs: jobs.map((j) => ({ id: j._id, ref: `JOB-${String(j._id).slice(-6).toUpperCase()}`, title: j.title, status: j.status, artisan: j.artisanID?.fullName, amount: j.agreedAmount || j.budget, createdAt: j.createdAt })),
    disputes: disputes.map((d) => ({ id: d._id, ref: `DSP-${String(d._id).slice(-6).toUpperCase()}`, status: d.status, reason: d.reason, createdAt: d.createdAt })),
  } });
};

export const listJobsAdmin = async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.search) filter.title = new RegExp(escapeRegex(req.query.search), "i");
  if (req.query.category) filter.category = String(req.query.category).toLowerCase();
  const [jobs, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate("customerID", "fullName email").populate("artisanID", "fullName email")
      .populate("invitedArtisanID", "fullName email").lean(),
    Job.countDocuments(filter),
  ]);
  const statuses = ["open", "booked", "funded", "awaiting_confirmation", "completed", "disputed", "cancelled"];
  const counts = Object.fromEntries(await Promise.all(statuses.map(async (s) => [s, await Job.countDocuments({ status: s })])));
  res.json({ jobs: jobs.map((j) => ({
    id: j._id, ref: `JOB-${String(j._id).slice(-6).toUpperCase()}`, title: j.title,
    category: j.category, customer: j.customerID, artisan: j.artisanID,
    amount: j.agreedAmount || j.budget, status: j.status, createdAt: j.createdAt,
    updatedAt: j.updatedAt, location: j.address,
  })), counts: { total: await Job.countDocuments(), ...counts }, total, page, limit });
};

export const getJobAdmin = async (req, res) => {
  const id = objectId(req.params.id, "job id");
  const [job, escrowRecord, dispute, review] = await Promise.all([
    Job.findById(id).populate("customerID", "fullName email phone").populate("artisanID", "fullName email phone").populate("quotes.artisanID", "fullName email").lean(),
    Escrow.findOne({ jobID: id }).lean(),
    Dispute.findOne({ jobID: id }).sort({ createdAt: -1 }).lean(),
    Review.findOne({ jobID: id }).populate("customerID", "fullName").populate("artisanID", "fullName").lean(),
  ]);
  if (!job) throw httpError(404, "Job not found");
  const escrow = escrowRecord ? {
    id: escrowRecord._id, status: escrowRecord.status,
    amountHeld: escrowRecord.heldAmount, totalAmount: escrowRecord.totalAmount,
    released: Math.max(0, escrowRecord.totalAmount - escrowRecord.remainingAmount - escrowRecord.refundedAmount),
    refunded: escrowRecord.refundedAmount, currency: escrowRecord.currency,
    materialPaymentStatus: escrowRecord.materialPaymentStatus,
    balancePaymentStatus: escrowRecord.balancePaymentStatus,
    materialApprovalStatus: escrowRecord.materialApprovalStatus || "not_requested",
    materialApprovalRequestedAt: escrowRecord.materialApprovalRequestedAt || null,
    materialApprovalReason: escrowRecord.materialApprovalReason || null,
    balanceApprovalStatus: escrowRecord.balanceApprovalStatus || "not_requested",
    balanceApprovalRequestedAt: escrowRecord.balanceApprovalRequestedAt || null,
    balanceApprovalReason: escrowRecord.balanceApprovalReason || null,
  } : null;
  const timeline = [
    { type: "created", at: job.createdAt, label: "Job created" },
    ...(job.progressUpdates || []).map((u) => ({ type: "progress", at: u.createdAt, label: u.note, percent: u.percent })),
    ...(job.completionMarkedAt ? [{ type: "completion", at: job.completionMarkedAt, label: "Completion submitted" }] : []),
    ...(job.updatedAt && String(job.updatedAt) !== String(job.createdAt) ? [{ type: "updated", at: job.updatedAt, label: "Last updated" }] : []),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  res.json({ job, escrow, dispute: dispute ? { id: dispute._id, status: dispute.status } : null, timeline, review });
};

export const listPaymentApprovals = async (req, res) => {
  const filter = { $or: [
    { materialApprovalStatus: "awaiting_approval" },
    { balanceApprovalStatus: "awaiting_approval" },
  ] };
  const rows = await Escrow.find(filter).sort({ materialApprovalRequestedAt: -1, balanceApprovalRequestedAt: -1 })
    .populate("jobID", "title status category completionNote completionPhotos completionMarkedAt")
    .populate("customerID", "fullName email phone")
    .populate("artisanID", "fullName email phone")
    .lean();
  const approvals = rows.flatMap((e) => {
    const base = {
      escrowId: e._id, jobId: e.jobID?._id,
      jobRef: e.jobID ? `JOB-${String(e.jobID._id).slice(-6).toUpperCase()}` : null,
      jobTitle: e.jobID?.title, jobStatus: e.jobID?.status,
      customer: e.customerID, artisan: e.artisanID,
      currency: e.currency, totalAmount: e.totalAmount,
      materialAmount: e.materialAmount, remainingAmount: e.remainingAmount,
      completionNote: e.jobID?.completionNote || null,
      completionPhotos: e.jobID?.completionPhotos || [],
      completionMarkedAt: e.jobID?.completionMarkedAt || null,
    };
    const result = [];
    if (e.materialApprovalStatus === "awaiting_approval") result.push({ ...base, id: `${e._id}:material`, type: "material", amount: e.materialAmount, requestedAt: e.materialApprovalRequestedAt });
    if (e.balanceApprovalStatus === "awaiting_approval") result.push({ ...base, id: `${e._id}:balance`, type: "completion", amount: e.remainingAmount, requestedAt: e.balanceApprovalRequestedAt });
    return result;
  });
  res.json({ approvals, counts: {
    total: approvals.length,
    material: approvals.filter((x) => x.type === "material").length,
    completion: approvals.filter((x) => x.type === "completion").length,
  } });
};

export const reviewPaymentApproval = async (req, res) => {
  const escrowId = objectId(req.params.escrowId, "escrow id");
  const type = String(req.params.type || "");
  const decision = String(req.body.decision || "");
  if (!["material", "completion"].includes(type)) throw httpError(400, "Invalid payment approval type");
  if (!["approve", "reject"].includes(decision)) throw httpError(400, "Decision must be approve or reject");
  const reason = decision === "reject" ? text(req.body.reason, { label: "Rejection reason", max: 500 }) : null;
  const escrow = type === "material"
    ? decision === "approve" ? await approveMaterialRelease(escrowId, req.user) : await rejectMaterialRelease(escrowId, req.user, reason)
    : decision === "approve" ? await approveBalanceRelease(escrowId, req.user) : await rejectBalanceRelease(escrowId, req.user, reason);
  await audit(req, `payment_${type}_${decision}`, "escrow", escrowId, { type, decision, reason, amount: type === "material" ? escrow.materialAmount : escrow.remainingAmount });
  res.json({ escrow, message: decision === "approve" ? "Payment approval processed" : "Payment release rejected" });
};



// Dedicated material-payment approval queue.
export const listMaterialApprovals = async (_req, res) => {
  const rows = await Escrow.find({ materialApprovalStatus: "awaiting_approval" })
    .sort({ materialApprovalRequestedAt: 1 })
    .populate("jobID", "title status category")
    .populate("customerID", "fullName email phone")
    .populate("artisanID", "fullName email phone")
    .lean();
  res.json({ approvals: rows.map((e) => ({
    escrowId: e._id, job: e.jobID, customer: e.customerID, artisan: e.artisanID,
    materialAmount: e.materialAmount, currency: e.currency,
    note: e.materialRequestNote || "", evidencePhotoUrls: e.materialEvidenceUrls || [],
    requestedAt: e.materialApprovalRequestedAt,
  })) });
};

export const approveMaterialApproval = async (req, res) => {
  const escrowId = objectId(req.params.escrowId, "escrow id");
  const escrow = await approveMaterialRelease(escrowId, req.user);
  await audit(req, "material_payment_approved", "escrow", escrowId, { amount: escrow.materialAmount });
  res.json({ escrow, message: "Material payment approved and payout initiated" });
};

export const rejectMaterialApproval = async (req, res) => {
  const escrowId = objectId(req.params.escrowId, "escrow id");
  const reason = text(req.body.reason, { label: "Rejection reason", max: 500 });
  const escrow = await rejectMaterialRelease(escrowId, req.user, reason);
  await audit(req, "material_payment_rejected", "escrow", escrowId, { reason });
  res.json({ escrow, message: "Material payment request rejected" });
};

// The queue may show requests before they become eligible. Approval is only
// possible after the dispute window has expired and the escrow is not disputed.
export const listEscrowReleases = async (_req, res) => {
  const rows = await Escrow.find({ balanceApprovalStatus: "awaiting_approval" })
    .sort({ balanceApprovalRequestedAt: 1 })
    .populate("jobID", "title status completionMarkedAt completionNote completionPhotos")
    .populate("customerID", "fullName email phone")
    .populate("artisanID", "fullName email phone")
    .lean();
  const now = Date.now();
  res.json({ releases: rows.map((e) => {
    const eligibleAt = e.disputeWindowEndsAt || (e.jobID?.completionMarkedAt
      ? new Date(new Date(e.jobID.completionMarkedAt).getTime() + 3 * 24 * 60 * 60 * 1000)
      : null);
    return {
      escrowId: e._id, job: e.jobID, customer: e.customerID, artisan: e.artisanID,
      amount: e.remainingAmount, currency: e.currency,
      requestedAt: e.balanceApprovalRequestedAt, eligibleAt,
      canApprove: Boolean(eligibleAt && now >= new Date(eligibleAt).getTime() && e.status !== "disputed"),
      disputed: e.status === "disputed",
    };
  }) });
};

export const approveEscrowRelease = async (req, res) => {
  const escrowId = objectId(req.params.escrowId, "escrow id");
  const escrow = await approveBalanceRelease(escrowId, req.user);
  await audit(req, "escrow_balance_release_approved", "escrow", escrowId, { amount: escrow.remainingAmount });
  res.json({ escrow, message: "Final balance release approved and payout initiated" });
};

export const listCategories = async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = {};
  if (req.query.status && req.query.status !== "all") filter.status = String(req.query.status);
  if (req.query.search) filter.name = new RegExp(escapeRegex(req.query.search), "i");
  const [categories, total] = await Promise.all([
    Category.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);
  const result = await Promise.all(categories.map(async (c) => ({
    ...c, artisanCount: await User.countDocuments({ role: "artisan", $or: [
      { "artisan.category": c.normalizedName }, { "artisan.trade": new RegExp(`^${escapeRegex(c.name)}$`, "i") },
    ] }),
    jobCount: await Job.countDocuments({ category: c.normalizedName }),
  })));
  res.json({ categories: result, counts: {
    total: await Category.countDocuments(),
    active: await Category.countDocuments({ status: "active" }),
    inactive: await Category.countDocuments({ status: "inactive" }),
  }, total, page, limit });
};

export const createCategory = async (req, res) => {
  const name = text(req.body.name, { label: "Category name", max: 60 });
  const normalizedName = name.toLowerCase().replace(/\s+/g, " ");
  const exists = await Category.findOne({ normalizedName });
  if (exists) throw httpError(409, "A category with this name already exists");
  const category = await Category.create({ name, normalizedName, createdBy: req.user._id });
  await audit(req, "category_created", "category", category._id, { name });
  res.status(201).json({ category });
};

export const updateCategory = async (req, res) => {
  const id = objectId(req.params.id, "category id");
  const category = await Category.findById(id);
  if (!category) throw httpError(404, "Category not found");
  if (req.body.name !== undefined) {
    const name = text(req.body.name, { label: "Category name", max: 60 });
    const normalizedName = name.toLowerCase().replace(/\s+/g, " ");
    const duplicate = await Category.findOne({ normalizedName, _id: { $ne: id } });
    if (duplicate) throw httpError(409, "A category with this name already exists");
    category.name = name;
    category.normalizedName = normalizedName;
  }
  if (req.body.status !== undefined) {
    if (!["active", "inactive"].includes(req.body.status)) throw httpError(400, "Status must be active or inactive");
    category.status = req.body.status;
  }
  await category.save();
  await audit(req, "category_updated", "category", category._id, { name: category.name, status: category.status });
  res.json({ category });
};

export const dashboard = async (_req, res) => {
  const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const [
    verificationCounts, openDisputes, activeJobs, totalArtisans, totalCustomers,
    funded, completedThisMonth, completedLastMonth, recentJobs, recentDisputes, pendingPaymentApprovals,
  ] = await Promise.all([
    supabaseAdmin.verificationCounts(),
    Dispute.countDocuments({ status: { $in: ["open", "in_review"] } }),
    Job.countDocuments({ status: { $in: ["booked", "funded", "awaiting_confirmation", "disputed"] } }),
    User.countDocuments({ role: "artisan" }),
    User.countDocuments({ role: "customer" }),
    Escrow.aggregate([{ $match: { status: { $in: ["payment_confirmed", "material_payment_made", "disputed"] } } }, { $group: { _id: null, total: { $sum: "$heldAmount" } } }]),
    Job.countDocuments({ status: "completed", updatedAt: { $gte: thisMonth } }),
    Job.countDocuments({ status: "completed", updatedAt: { $gte: new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1), $lt: thisMonth } }),
    Job.find().sort({ createdAt: -1 }).limit(10).populate("customerID", "fullName").populate("artisanID", "fullName").lean(),
    Dispute.find().sort({ createdAt: -1 }).limit(10).populate("jobID", "title").lean(),
    Escrow.countDocuments({ $or: [{ materialApprovalStatus: "awaiting_approval" }, { balanceApprovalStatus: "awaiting_approval" }] }),
  ]);
  const totalVolume = await Payment.aggregate([{ $match: { status: "completed" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  res.json({
    stats: { pendingVerifications: verificationCounts.pending || 0, pendingPaymentApprovals, openDisputes, activeJobs, totalArtisans, totalCustomers,
      fundsHeld: funded[0]?.total || 0, completedThisMonth, completedLastMonth,
      totalVolume: totalVolume[0]?.total || 0 },
    recentActivity: [
      ...recentJobs.map((j) => ({ type: "job", text: j.title, at: j.createdAt, link: `/jobs/${j._id}` })),
      ...recentDisputes.map((d) => ({ type: "dispute", text: d.jobID?.title || d.reason, at: d.createdAt, link: `/disputes/${d._id}` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10),
    jobsByStatus: await Job.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  });
};

export const adminAuditLog = async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const [items, total] = await Promise.all([
    AdminAudit.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("adminID", "fullName email").lean(),
    AdminAudit.countDocuments(),
  ]);
  res.json({ audit: items, total, page, limit });
};

export const reconcile = async (req, res) => {
  if (req.params.reference) {
    const settled = await reconcileTransfer(String(req.params.reference));
    return res.json({ settled: Boolean(settled) });
  }
  res.json({ results: await reconcilePendingTransfers() });
};

export const artisanDiscoveryDiagnostics = async (_req, res) => {
  const [totalArtisans, verifiedArtisans, withTrade, availableArtisans, discoverableArtisans] = await Promise.all([
    User.countDocuments({ role: "artisan" }),
    User.countDocuments({ role: "artisan", verified: true }),
    User.countDocuments({ role: "artisan", "artisan.trade": { $exists: true, $ne: "" } }),
    User.countDocuments({ role: "artisan", "artisan.available": { $ne: false } }),
    User.countDocuments({ role: "artisan", verified: true, "artisan.trade": { $exists: true, $ne: "" }, "artisan.available": { $ne: false } }),
  ]);
  res.json({ diagnostics: { totalArtisans, verifiedArtisans, withTrade, availableArtisans, discoverableArtisans } });
};

export const reconcileArtisanMarketplace = async (_req, res) => {
  const userIds = await supabaseAdmin.artisanUserIds();
  const results = { scanned: userIds.length, queued: 0, enqueueFailures: [] };
  for (let index = 0; index < userIds.length; index += 25) {
    const batch = userIds.slice(index, index + 25);
    const settled = await Promise.allSettled(batch.map((userId) => enqueueArtisanSync(userId)));
    settled.forEach((result, offset) => {
      if (result.status === "fulfilled") results.queued += 1;
      else results.enqueueFailures.push({ userId: batch[offset], message: result.reason?.message || "Unable to queue" });
    });
  }
  const worker = await drainArtisanSyncQueue({ maxJobs: 10 });
  const queue = await artisanSyncQueueDiagnostics();
  res.status(results.enqueueFailures.length ? 207 : 202).json({
    ...results, processedImmediately: worker.processed, queue,
    complete: results.enqueueFailures.length === 0 && queue.pending === 0 && queue.processing === 0,
    message: "Reconciliation jobs have been queued. Check queue diagnostics until pending jobs reach zero.",
  });
};

export const artisanSyncQueueStatus = async (_req, res) => res.json({ queue: await artisanSyncQueueDiagnostics() });
export const retryArtisanSyncQueue = async (_req, res) => {
  const retried = await retryFailedArtisanSyncJobs();
  const worker = await drainArtisanSyncQueue({ maxJobs: 10 });
  res.json({ retried, processedImmediately: worker.processed, queue: await artisanSyncQueueDiagnostics() });
};
