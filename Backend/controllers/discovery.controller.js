import User from "../models/user.js";
import Job from "../models/job.js";
import Review from "../models/review.js";
import SavedArtisan from "../models/savedArtisan.js";
import { httpError } from "../utils/httpError.js";
import { objectId, sameId, text } from "../utils/validate.js";
import { normalizeCategory } from "../utils/trade.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const distanceKm = (a, b) => {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
};

const DISCOVERABLE = {
  role: "artisan",
  verified: true,
  "artisan.trade": { $exists: true, $ne: "" },
  "artisan.available": { $ne: false },
};

const publicShape = (u, { jobs = 0, from, savedIds } = {}) => ({
  id: String(u._id),
  name: u.fullName || "Artisan",
  avatarUrl: u.avatarUrl || null,
  trade: u.artisan?.trade || "",
  category: u.artisan?.category || "",
  services: u.artisan?.services || [],
  bio: u.artisan?.bio || "",
  experienceYears: u.artisan?.experienceYears ?? null,
  area: [u.artisan?.lga, u.artisan?.state].filter(Boolean).join(", "),
  rating: u.ratingCount ? Math.round(u.ratingAvg * 10) / 10 : null,
  reviewCount: u.ratingCount || 0,
  jobsCompleted: jobs,
  verified: Boolean(u.verified),
  distanceKm: distanceKm(from, u.artisan?.location),
  joinedAt: u.createdAt,
  saved: savedIds ? savedIds.has(String(u._id)) : undefined,
});

const completedCounts = async (ids) => {
  const rows = await Job.aggregate([
    { $match: { artisanID: { $in: ids }, status: "completed" } },
    { $group: { _id: "$artisanID", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
};

const savedSet = async (customerId, ids) => {
  const rows = await SavedArtisan.find(
    { customerID: customerId, artisanID: { $in: ids } },
    "artisanID",
  ).lean();
  return new Set(rows.map((r) => String(r.artisanID)));
};

const parseFrom = (q) => {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    q.lat !== "" &&
    q.lng !== ""
    ? { lat, lng }
    : undefined;
};

export const search = async (req, res) => {
  const filter = { ...DISCOVERABLE };
  const q = String(req.query.q || "")
    .trim()
    .slice(0, 60);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { fullName: rx },
      { "artisan.trade": rx },
      { "artisan.services": rx },
      { "artisan.lga": rx },
      { "artisan.state": rx },
    ];
  }
  if (req.query.category)
    filter["artisan.category"] = normalizeCategory(
      req.query.category,
      req.query.category,
    );
  const minRating = Number(req.query.minRating) || 0;
  if (minRating > 0) filter.ratingAvg = { $gte: minRating };

  const from = parseFrom(req.query);
  const maxDistance = Number(req.query.maxDistance) || 0;
  const sort = String(req.query.sort || "recommended");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const docs = await User.find(filter)
    .sort({ ratingAvg: -1, ratingCount: -1 })
    .limit(300)
    .lean();
  const jobs = await completedCounts(docs.map((d) => d._id));

  let rows = docs.map((d) => ({
    doc: d,
    dist: distanceKm(from, d.artisan?.location),
  }));
  if (maxDistance > 0 && from)
    rows = rows.filter((r) => r.dist !== null && r.dist <= maxDistance);

  const score = (d) =>
    ((d.ratingAvg || 0) * (d.ratingCount || 0) + 4 * 3) /
    ((d.ratingCount || 0) + 3);
  rows.sort((a, b) => {
    if (sort === "rating")
      return (
        (b.doc.ratingAvg || 0) - (a.doc.ratingAvg || 0) ||
        (b.doc.ratingCount || 0) - (a.doc.ratingCount || 0)
      );
    if (sort === "newest")
      return new Date(b.doc.createdAt) - new Date(a.doc.createdAt);
    if (sort === "nearest") return (a.dist ?? Infinity) - (b.dist ?? Infinity);
    return (
      score(b.doc) - score(a.doc) ||
      (jobs.get(String(b.doc._id)) || 0) - (jobs.get(String(a.doc._id)) || 0)
    );
  });

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * limit, page * limit);
  const saved = await savedSet(
    req.user._id,
    pageRows.map((r) => r.doc._id),
  );
  res.json({
    artisans: pageRows.map((r) =>
      publicShape(r.doc, {
        jobs: jobs.get(String(r.doc._id)) || 0,
        from,
        savedIds: saved,
      }),
    ),
    total,
    page,
    limit,
  });
};

export const profile = async (req, res) => {
  const user = await User.findOne({
    _id: objectId(req.params.id, "artisan id"),
    ...DISCOVERABLE,
  }).lean();
  if (!user) throw httpError(404, "Artisan not found");

  const [jobs, saved, reviews] = await Promise.all([
    completedCounts([user._id]),
    savedSet(req.user._id, [user._id]),
    Review.find({ artisanID: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("customerID", "fullName avatarUrl")
      .lean(),
  ]);

  const breakdown =
    user.ratingBreakdown?.length === 5 ? user.ratingBreakdown : [0, 0, 0, 0, 0];
  res.json({
    artisan: {
      ...publicShape(user, {
        jobs: jobs.get(String(user._id)) || 0,
        from: parseFrom(req.query),
        savedIds: saved,
      }),
      portfolio: user.artisan?.portfolio || [],

      ratingPercent: [4, 3, 2, 1, 0].map((i) =>
        user.ratingCount
          ? Math.round((breakdown[i] / user.ratingCount) * 100)
          : 0,
      ),
    },
    reviews: reviews.map(reviewShape),
  });
};

const reviewShape = (r) => ({
  id: String(r._id),
  rating: r.rating,
  comment: r.comment || "",
  createdAt: r.createdAt,
  reviewer: shortName(r.customerID?.fullName),
  reviewerAvatar: r.customerID?.avatarUrl || null,
});

const shortName = (full) => {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Customer";
  return parts.length === 1
    ? parts[0]
    : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

export const reviewsFor = async (req, res) => {
  const id = objectId(req.params.id, "artisan id");
  const visibleArtisan = await User.exists({ _id: id, ...DISCOVERABLE });
  if (!visibleArtisan) throw httpError(404, "Artisan not found");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const rows = await Review.find({ artisanID: id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("customerID", "fullName avatarUrl")
    .lean();
  res.json({ reviews: rows.map(reviewShape), page });
};

export const listSaved = async (req, res) => {
  const rows = await SavedArtisan.find({ customerID: req.user._id })
    .sort({ createdAt: -1 })
    .populate("artisanID")
    .lean();
  const users = rows
    .map((r) => r.artisanID)
    .filter(
      (u) =>
        u &&
        u.role === "artisan" &&
        u.verified === true &&
        u.artisan?.trade &&
        u.artisan?.available !== false,
    );
  const jobs = await completedCounts(users.map((u) => u._id));
  res.json({
    artisans: users.map((u) =>
      publicShape(u, {
        jobs: jobs.get(String(u._id)) || 0,
        savedIds: new Set([String(u._id)]),
      }),
    ),
  });
};

export const save = async (req, res) => {
  const id = objectId(req.params.id, "artisan id");
  const exists = await User.exists({ _id: id, ...DISCOVERABLE });
  if (!exists) throw httpError(404, "Verified artisan not found");
  await SavedArtisan.updateOne(
    { customerID: req.user._id, artisanID: id },
    { $setOnInsert: { customerID: req.user._id, artisanID: id } },
    { upsert: true },
  );
  res.json({ saved: true });
};

export const unsave = async (req, res) => {
  await SavedArtisan.deleteOne({
    customerID: req.user._id,
    artisanID: objectId(req.params.id, "artisan id"),
  });
  res.json({ saved: false });
};

export const createReview = async (req, res) => {
  const job = await Job.findById(objectId(req.body.jobId, "job id"));
  if (!job || !sameId(job.customerID, req.user._id))
    throw httpError(404, "Job not found");
  if (job.status !== "completed" || !job.artisanID)
    throw httpError(409, "You can review an artisan once the job is completed");

  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw httpError(400, "Rating must be 1 to 5 stars");
  const comment = text(req.body.comment, {
    label: "Comment",
    max: 1000,
    required: false,
  });

  let review;
  try {
    review = await Review.create({
      jobID: job._id,
      customerID: req.user._id,
      artisanID: job.artisanID,
      rating,
      comment,
    });
  } catch (e) {
    if (e.code === 11000)
      throw httpError(409, "You have already reviewed this job");
    throw e;
  }

  await User.updateOne({ _id: job.artisanID }, [
    {
      $set: {
        ratingBreakdown: {
          $map: {
            input: { $range: [0, 5] },
            as: "i",
            in: {
              $add: [
                { $ifNull: [{ $arrayElemAt: ["$ratingBreakdown", "$$i"] }, 0] },
                { $cond: [{ $eq: ["$$i", rating - 1] }, 1, 0] },
              ],
            },
          },
        },
        ratingCount: { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
      },
    },
    {
      $set: {
        ratingAvg: {
          $divide: [
            {
              $sum: {
                $map: {
                  input: { $range: [0, 5] },
                  as: "i",
                  in: {
                    $multiply: [
                      { $add: ["$$i", 1] },
                      { $arrayElemAt: ["$ratingBreakdown", "$$i"] },
                    ],
                  },
                },
              },
            },
            "$ratingCount",
          ],
        },
      },
    },
  ]);

  res.status(201).json({
    review: reviewShape({ ...review.toObject(), customerID: req.user }),
  });
};

export const myReviews = async (req, res) => {
  const rows = await Review.find({ artisanID: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("customerID", "fullName avatarUrl")
    .lean();
  res.json({
    reviews: rows.map(reviewShape),
    rating: req.user.ratingCount
      ? Math.round(req.user.ratingAvg * 10) / 10
      : null,
    reviewCount: req.user.ratingCount || 0,
    ratingPercent: [4, 3, 2, 1, 0].map((i) =>
      req.user.ratingCount
        ? Math.round(
            ((req.user.ratingBreakdown?.[i] || 0) / req.user.ratingCount) * 100,
          )
        : 0,
    ),
  });
};

export const discoveryDiagnostics = async (req, res) => {
  try {
    const [
      totalArtisans,
      verifiedArtisans,
      withTrade,
      availableArtisans,
      discoverableArtisans,
    ] = await Promise.all([
      User.countDocuments({ role: "artisan" }),

      User.countDocuments({
        role: "artisan",
        verified: true,
      }),

      User.countDocuments({
        role: "artisan",
        "artisan.trade": { $exists: true, $ne: "" },
      }),

      User.countDocuments({
        role: "artisan",
        "artisan.available": { $ne: false },
      }),

      User.countDocuments({
        role: "artisan",
        verified: true,
        "artisan.trade": { $exists: true, $ne: "" },
        "artisan.available": { $ne: false },
      }),
    ]);

    res.json({
      diagnostics: {
        totalArtisans,
        verifiedArtisans,
        withTrade,
        availableArtisans,
        discoverableArtisans,
      },
    });
  } catch (error) {
    console.error("Discovery diagnostics:", error);
    res.status(500).json({
      message: "Unable to retrieve discovery diagnostics",
    });
  }
};
