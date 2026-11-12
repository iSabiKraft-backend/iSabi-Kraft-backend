import Job from "../models/job.js";
import Escrow from "../models/escrow.js";
import { httpError } from "../utils/httpError.js";
import User from "../models/user.js";
import Category from "../models/category.js";
import { naira, objectId, sameId, text } from "../utils/validate.js";

const POPULATE = [
  { path: "customerID", select: "fullName avatarUrl avatar_url" },
  { path: "artisanID", select: "fullName avatarUrl avatar_url supabaseId verified" },
  { path: "quotes.artisanID", select: "fullName avatarUrl avatar_url supabaseId verified" },
];

const shape = (job, user, role) => {
  const out = job.toObject();
  if (role === "artisan")
    out.quotes = out.quotes.filter((q) => sameId(q.artisanID, user._id));
  return out;
};

const canView = (job, user, role) =>
  role === "admin" ||
  sameId(job.customerID, user._id) ||
  sameId(job.artisanID, user._id) ||
  (role === "artisan" &&
    job.status === "open" &&
    (!job.invitedArtisanID || sameId(job.invitedArtisanID, user._id)));

export const createJob = async (req, res) => {
  const b = req.body;
  const description = text(b.description, {
    label: "Description",
    min: 5,
    max: 2000,
  });
  const category = text(b.category, { label: "Category", max: 40 }).toLowerCase();
  if (await Category.exists({ normalizedName: category, status: "active" }) === null) {
    throw httpError(400, "Choose an active category from the current category list");
  }
  const address = text(b.address, { label: "Address", max: 300 });
  const budget = naira(b.budget, { label: "Budget", min: 1 });

  let preferredDate;
  if (b.preferredDate) {
    preferredDate = new Date(b.preferredDate);
    if (Number.isNaN(preferredDate.getTime()))
      throw httpError(400, "Preferred date is invalid");
  }
  const photos = Array.isArray(b.photos)
    ? b.photos.filter((u) => /^https:\/\//.test(String(u))).slice(0, 10)
    : [];
  const lat = Number(b.location?.lat);
  const lng = Number(b.location?.lng);

  let invitedArtisanID;
  if (b.invitedArtisanID) {
    const invited = await User.findOne({
      _id: objectId(b.invitedArtisanID, "artisan id"),
      role: "artisan",
      verified: true,
      "artisan.trade": { $exists: true, $ne: "" },
      "artisan.available": { $ne: false },
    });
    if (!invited) throw httpError(404, "That artisan is not available");
    invitedArtisanID = invited._id;
  }

  const job = await Job.create({
    customerID: req.user._id,
    invitedArtisanID,
    title:
      text(b.title, { label: "Title", max: 120, required: false }) ||
      `${category} job`.slice(0, 120),
    category,
    description,
    jobType: text(b.jobType, { label: "Job type", max: 60, required: false }),
    urgency: text(b.urgency, { label: "Urgency", max: 60, required: false }),
    address,
    location:
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
    photos,
    preferredDate,
    preferredTime: text(b.preferredTime, {
      label: "Preferred time",
      max: 40,
      required: false,
    }),
    budget,
  });
  res.status(201).json({ job });
};

export const listJobs = async (req, res) => {
  const filter = {};
  if (req.role === "artisan") {
    filter.$or = [
      {
        status: "open",
        $or: [{ invitedArtisanID: null }, { invitedArtisanID: req.user._id }],
      },
      { artisanID: req.user._id },
    ];
  } else if (req.role === "admin") filter.status = { $exists: true };
  else filter.customerID = req.user._id;

  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.category)
    filter.category = String(req.query.category).toLowerCase();

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const jobs = await Job.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate(POPULATE);
  res.json({
    jobs: jobs.map((j) => shape(j, req.user, req.role)),
    page,
    limit,
  });
};

export const getJob = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id")).populate(
    POPULATE,
  );
  if (!job || !canView(job, req.user, req.role))
    throw httpError(404, "Job not found");
  const escrow = await Escrow.findOne({ jobID: job._id });
  const visible =
    sameId(job.customerID, req.user._id) ||
    sameId(job.artisanID, req.user._id) ||
    req.role === "admin";
  res.json({
    job: shape(job, req.user, req.role),
    escrow: visible ? escrow : null,
  });
};

export const submitQuote = async (req, res) => {
  if (req.role !== "artisan" || req.user.role !== "artisan") {
    throw httpError(403, "Only artisan accounts can submit quotes");
  }
  if (!req.user.verified) {
    const status = req.user.verificationStatus;
    if (status === "info_requested") {
      throw httpError(403, "More identity information is required. Upload the requested documents and resubmit your verification");
    }
    if (status === "rejected") {
      throw httpError(
        403,
        "Your identity verification was rejected. Review the rejection reason and resubmit your documents",
      );
    }
    throw httpError(403, "Your identity verification is pending approval");
  }
  if (!req.user.artisan?.trade || !req.user.artisan?.category) {
    throw httpError(
      403,
      "Your professional profile has not been published. Complete your artisan profile before sending quotes",
    );
  }
  if (req.user.artisan.available === false) {
    throw httpError(
      403,
      "Your artisan account is currently unavailable for new jobs",
    );
  }
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (!job || job.status !== "open")
    throw httpError(409, "This job is not accepting quotes");
  if (job.invitedArtisanID && !sameId(job.invitedArtisanID, req.user._id))
    throw httpError(403, "This job was sent to another artisan");

  const labour = naira(req.body.labour, { label: "Labour" });
  const materials = naira(req.body.materials ?? 0, { label: "Materials" });
  const additional = naira(req.body.additional ?? 0, {
    label: "Additional costs",
  });
  const total = labour + materials + additional;
  if (total < 1) throw httpError(400, "Quote total must be greater than zero");
  const materialItems = Array.isArray(req.body.materialItems)
    ? req.body.materialItems.slice(0, 24).map((item) => {
        const quantity = Number(item.quantity);
        const unitPrice = naira(item.unitPrice ?? 0, { label: "Material unit price" });
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000)
          throw httpError(400, "Material quantity must be greater than zero");
        return {
          name: text(item.name, { label: "Material name", max: 80 }),
          quantity,
          unitPrice,
          total: Math.round(quantity * unitPrice),
        };
      })
    : [];

  const fields = {
    labour,
    materials,
    materialItems,
    additional,
    total,
    duration: text(req.body.duration, {
      label: "Duration",
      max: 100,
      required: false,
    }),
    note: text(req.body.note, { label: "Note", max: 1000, required: false }),
  };

  const existing = job.quotes.find((q) => sameId(q.artisanID, req.user._id));
  if (existing) {
    if (existing.changeRequest?.status === "pending") {
      existing.previousTotal = existing.total;
      existing.changeRequest.status = "resolved";
      existing.changeRequest.resolvedAt = new Date();
    }
    Object.assign(existing, fields, { status: "pending" });
  } else job.quotes.push({ artisanID: req.user._id, ...fields });
  await job.save();

  const quote = job.quotes.find((q) => sameId(q.artisanID, req.user._id));
  res.status(existing ? 200 : 201).json({ quote });
};

export const inviteArtisan = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (!job || !sameId(job.customerID, req.user._id))
    throw httpError(404, "Job not found");
  if (job.status !== "open")
    throw httpError(409, "This job can no longer be sent to someone else");
  if (job.quotes.length > 0)
    throw httpError(409, "This job already has quotes");
  const artisan = await User.findOne({
    _id: objectId(req.body.artisanId, "artisan id"),
    role: "artisan",
    verified: true,
    "artisan.trade": { $exists: true, $ne: "" },
    "artisan.available": { $ne: false },
  });
  if (!artisan) throw httpError(404, "That artisan is not available");
  job.invitedArtisanID = artisan._id;
  await job.save();
  res.json({ job });
};

export const acceptQuote = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (!job || !sameId(job.customerID, req.user._id))
    throw httpError(404, "Job not found");
  if (job.status !== "open")
    throw httpError(409, "A quote has already been accepted for this job");

  const quote = job.quotes.id(objectId(req.params.quoteId, "quote id"));
  if (!quote) throw httpError(404, "Quote not found");

  job.quotes.forEach((q) => {
    q.status = sameId(q._id, quote._id) ? "accepted" : "rejected";
  });
  job.status = "booked";
  job.acceptedQuoteID = quote._id;
  job.artisanID = quote.artisanID;
  job.agreedAmount = quote.total;
  await job.save();
  res.json({ job });
};

const CHANGE_TYPES = [
  "Scope of work",
  "Materials / Supplies",
  "Timeline / Schedule",
  "Cost / Price",
  "Work method",
  "Other",
];

const loadOpenQuote = async (req) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (!job || !sameId(job.customerID, req.user._id))
    throw httpError(404, "Job not found");
  if (job.status !== "open")
    throw httpError(409, "A quote has already been accepted for this job");
  const quote = job.quotes.id(objectId(req.params.quoteId, "quote id"));
  if (!quote) throw httpError(404, "Quote not found");
  return { job, quote };
};

export const declineQuote = async (req, res) => {
  const { job, quote } = await loadOpenQuote(req);
  quote.status = "rejected";
  await job.save();
  res.json({ quote });
};

export const requestQuoteChange = async (req, res) => {
  const { job, quote } = await loadOpenQuote(req);
  if (quote.status !== "pending")
    throw httpError(409, "This quote can no longer be changed");
  if (quote.changeRequest?.status === "pending")
    throw httpError(409, "A change request is already waiting for the artisan");

  const type = text(req.body.type, { label: "Change type", max: 40 });
  if (!CHANGE_TYPES.includes(type))
    throw httpError(400, "Choose a valid change type");
  let proposedDate;
  if (req.body.proposedDate) {
    proposedDate = new Date(req.body.proposedDate);
    if (Number.isNaN(proposedDate.getTime()))
      throw httpError(400, "Proposed date is invalid");
  }
  const photos = Array.isArray(req.body.photos)
    ? req.body.photos.filter((u) => /^https:\/\//.test(String(u))).slice(0, 5)
    : [];

  quote.changeRequest = {
    type,
    description: text(req.body.description, {
      label: "Description",
      min: 5,
      max: 1000,
    }),
    details: text(req.body.details, {
      label: "Additional details",
      max: 1000,
      required: false,
    }),
    proposedDate,
    photos,
    status: "pending",
    createdAt: new Date(),
  };
  await job.save();
  res.status(201).json({ quote });
};

export const postProgress = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (!job || !sameId(job.artisanID, req.user._id))
    throw httpError(404, "Job not found");
  if (job.status !== "funded")
    throw httpError(
      409,
      "Progress can only be updated while the job is in progress",
    );
  const percent = Number(req.body.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw httpError(400, "Progress must be between 0 and 100");
  const note = text(req.body.note, { label: "Update", min: 3, max: 1000 });
  job.progress = Math.round(percent);
  job.progressUpdates.push({ note, percent: job.progress });
  await job.save();
  res.status(201).json({ job });
};

export const cancelJob = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (!job || !sameId(job.customerID, req.user._id))
    throw httpError(404, "Job not found");
  if (!["open", "booked"].includes(job.status))
    throw httpError(409, "This job can no longer be cancelled");

  const closed = await Escrow.updateOne(
    { jobID: job._id, status: "pending" },
    { $set: { status: "failed" } },
  );
  const escrow = closed.matchedCount
    ? null
    : await Escrow.findOne({ jobID: job._id });
  if (escrow)
    throw httpError(
      409,
      "This job has been paid for. Raise a dispute instead.",
    );

  job.status = "cancelled";
  await job.save();
  res.json({ job });
};

export const requestChange = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (
    !job ||
    ![job.customerID, job.artisanID].some((id) => sameId(id, req.user._id))
  )
    throw httpError(404, "Job not found");
  if (!["booked", "funded"].includes(job.status))
    throw httpError(409, "Job changes are unavailable at this stage");
  if (job.changeRequests.some((r) => r.status === "pending"))
    throw httpError(409, "Resolve the existing change request first");
  const reason = text(req.body.reason, { label: "Reason", min: 5, max: 1000 });
  const proposedAmount =
    req.body.proposedAmount === undefined || req.body.proposedAmount === ""
      ? undefined
      : naira(req.body.proposedAmount, { label: "Proposed amount", min: 1 });
  let proposedDate;
  if (req.body.proposedDate) {
    proposedDate = new Date(req.body.proposedDate);
    if (Number.isNaN(proposedDate.getTime()))
      throw httpError(400, "Invalid proposed date");
  }
  if (proposedAmount !== undefined && job.status === "funded")
    throw httpError(
      409,
      "Funded job amounts cannot change without a payment adjustment",
    );
  job.changeRequests.push({
    requestedBy: req.user._id,
    reason,
    proposedAmount,
    proposedDate,
  });
  await job.save();
  res.status(201).json({ changeRequest: job.changeRequests.at(-1) });
};

export const respondChange = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (
    !job ||
    ![job.customerID, job.artisanID].some((id) => sameId(id, req.user._id))
  )
    throw httpError(404, "Job not found");
  const change = job.changeRequests.id(
    objectId(req.params.changeId, "change request id"),
  );
  if (!change) throw httpError(404, "Change request not found");
  if (sameId(change.requestedBy, req.user._id))
    throw httpError(403, "You cannot approve your own request");
  if (change.status !== "pending")
    throw httpError(409, "This request was already decided");
  if (!["approved", "rejected"].includes(req.body.decision))
    throw httpError(400, "Decision must be approved or rejected");
  if (!["booked", "funded"].includes(job.status))
    throw httpError(409, "Job can no longer be changed");
  if (req.body.decision === "approved") {
    if (change.proposedAmount !== undefined) {
      if (job.status !== "booked")
        throw httpError(409, "Funded job amount cannot change");
      job.agreedAmount = change.proposedAmount;
    }
    if (change.proposedDate) job.preferredDate = change.proposedDate;
  }
  change.status = req.body.decision;
  change.respondedAt = new Date();
  await job.save();
  res.json({ job });
};
