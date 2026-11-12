import Job from "../models/job.js";
import User from "../models/user.js";
import { httpError } from "../utils/httpError.js";
import { objectId, sameId } from "../utils/validate.js";
import { requestArtisanMatches } from "../services/aiMatchingService.js";

const normalize = (value) => String(value || "").trim().toLowerCase();

function jobArea(address) {
  const normalized = normalize(address);
  const knownAreas = [
    "ikeja", "yaba", "lekki", "surulere", "ikorodu", "maryland",
    "victoria island", "ojota", "agege", "alimosho", "amuwo-odofin",
    "apapa", "badagry", "epe", "eti-osa", "ibeju-lekki", "ifako-ijaiye",
    "kosofe", "lagos island", "lagos mainland", "mushin", "ojo",
    "oshodi-isolo", "shomolu",
  ];
  return knownAreas.find((area) => normalized.includes(area)) ||
    String(address || "").split(",").map((part) => part.trim()).filter(Boolean)[0] || "";
}

export const recommendationsForJob = async (req, res) => {
  const job = await Job.findById(objectId(req.params.id, "job id"));
  if (!job || !sameId(job.customerID, req.user._id)) {
    throw httpError(404, "Job not found");
  }
  if (job.status !== "open") {
    throw httpError(409, "Recommendations are only available for open jobs");
  }

  const category = normalize(job.category);
  const eligible = await User.find({
    role: "artisan",
    verified: true,
    "artisan.trade": { $exists: true, $ne: "" },
    "artisan.category": category,
    "artisan.available": { $ne: false },
  }).select("fullName avatarUrl verified artisan ratingAvg ratingCount").lean();

  if (!eligible.length) {
    return res.json({ jobId: String(job._id), total: 0, radiusKmUsed: 0, widened: false, artisans: [] });
  }

  const ids = eligible.map((artisan) => artisan._id);
  const completed = await Job.aggregate([
    { $match: { artisanID: { $in: ids }, status: "completed" } },
    { $group: { _id: "$artisanID", count: { $sum: 1 } } },
  ]);
  const completedById = new Map(completed.map((row) => [String(row._id), row.count]));

  // The AI service receives only the minimum matching fields. MongoDB remains
  // the source of truth for identity, verification, availability and profiles.
  const candidates = eligible.map((artisan) => ({
    id: String(artisan._id),
    name: artisan.fullName || "Artisan",
    categories: [artisan.artisan?.category, artisan.artisan?.trade, ...(artisan.artisan?.services || [])]
      .map(normalize).filter(Boolean),
    state: artisan.artisan?.state || "Lagos",
    area: artisan.artisan?.lga || "",
    latitude: Number.isFinite(artisan.artisan?.location?.lat) ? artisan.artisan.location.lat : null,
    longitude: Number.isFinite(artisan.artisan?.location?.lng) ? artisan.artisan.location.lng : null,
    rating: Number(artisan.ratingAvg || 0),
    jobs_completed: completedById.get(String(artisan._id)) || 0,
    available: artisan.artisan?.available !== false,
  }));

  const matchResult = await requestArtisanMatches({
    id: String(job._id),
    category,
    description: job.description,
    state: "Lagos",
    area: jobArea(job.address),
    latitude: Number.isFinite(job.location?.lat) ? job.location.lat : null,
    longitude: Number.isFinite(job.location?.lng) ? job.location.lng : null,
    timeline: job.urgency || undefined,
  }, candidates);

  const byId = new Map(eligible.map((artisan) => [String(artisan._id), artisan]));
  const artisans = (matchResult.matches || []).map((match, index) => {
    const artisan = byId.get(String(match.artisan_id));
    if (!artisan) return null;
    return {
      id: String(artisan._id),
      name: artisan.fullName || match.name || "Artisan",
      avatarUrl: artisan.avatarUrl || null,
      trade: artisan.artisan?.trade || "",
      category: artisan.artisan?.category || category,
      area: artisan.artisan?.lga || match.area || "",
      state: artisan.artisan?.state || match.state || "Lagos",
      rating: artisan.ratingCount ? Math.round((artisan.ratingAvg || 0) * 10) / 10 : null,
      reviewCount: artisan.ratingCount || 0,
      jobsCompleted: completedById.get(String(artisan._id)) || 0,
      verified: Boolean(artisan.verified),
      distanceKm: match.distance_km,
      aiScore: match.score,
      matchLabel: index === 0 ? "Best match" : index === 1 ? "Good match" : null,
      matchReasons: match.reasons || [],
    };
  }).filter(Boolean);

  res.json({
    jobId: String(job._id),
    total: artisans.length,
    radiusKmUsed: matchResult.radius_km_used,
    widened: Boolean(matchResult.widened),
    artisans,
  });
};
