
import mongoose from "mongoose";
import Job from "../models/job.js";
import User from "../models/user.js";
import { httpError } from "../utils/httpError.js";

const MAX_CANDIDATES = 200;

export const getMatchingCandidates = async (req, res) => {
  const jobId = String(req.body?.jobId || "").trim();

  if (!mongoose.isValidObjectId(jobId)) {
    throw httpError(400, "A valid jobId is required");
  }

  // 1. Retrieve the job
  const job = await Job.findById(jobId)
    .select(
      "title category description jobType urgency budget location preferredDate preferredTime status invitedArtisanID createdAt"
    )
    .lean();

  if (!job) {
    throw httpError(404, "Job not found");
  }

  if (job.status !== "open") {
    throw httpError(
      409,
      "AI matching is only available for open jobs"
    );
  }

  // 2. Validate candidate limit
  const requestedLimit = Number(req.body?.limit ?? 100);

  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1
  ) {
    throw httpError(400, "limit must be a positive integer");
  }

  const limit = Math.min(requestedLimit, MAX_CANDIDATES);

  // 3. Only select verified and available artisans
  const artisanFilter = {
    role: "artisan",
    verified: true,
    "artisan.trade": { $exists: true, $ne: "" },
    "artisan.available": { $ne: false },
  };

  // Respect customer invitations
  if (job.invitedArtisanID) {
    artisanFilter._id = job.invitedArtisanID;
  }

  // 4. Retrieve artisan matching information
  const artisans = await User.find(artisanFilter)
    .select(
      "fullName avatarUrl artisan.trade artisan.category artisan.services artisan.bio artisan.experienceYears artisan.state artisan.lga artisan.location artisan.portfolio artisan.available ratingAvg ratingCount createdAt"
    )
    .sort({
      ratingAvg: -1,
      ratingCount: -1,
      createdAt: -1,
    })
    .limit(limit)
    .lean();

  // 5. Calculate completed jobs
  const artisanIds = artisans.map((artisan) => artisan._id);

  const completedJobs = artisanIds.length
    ? await Job.aggregate([
        {
          $match: {
            artisanID: { $in: artisanIds },
            status: "completed",
          },
        },
        {
          $group: {
            _id: "$artisanID",
            count: { $sum: 1 },
          },
        },
      ])
    : [];

  const completedCountByArtisan = new Map(
    completedJobs.map((row) => [
      String(row._id),
      row.count,
    ])
  );

  // 6. Return matching dataset
  res.status(200).json({
    success: true,

    job: {
      id: String(job._id),
      title: job.title,
      category: job.category,
      description: job.description,
      jobType: job.jobType || null,
      urgency: job.urgency || null,
      budget: job.budget,
      location: job.location || null,
      preferredDate: job.preferredDate || null,
      preferredTime: job.preferredTime || null,
      invitedOnly: Boolean(job.invitedArtisanID),
    },

    candidates: artisans.map((artisan) => ({
      id: String(artisan._id),
      name: artisan.fullName || "Artisan",
      avatarUrl: artisan.avatarUrl || null,

      trade: artisan.artisan?.trade || "",
      category: artisan.artisan?.category || "",
      services: artisan.artisan?.services || [],
      bio: artisan.artisan?.bio || "",

      experienceYears:
        artisan.artisan?.experienceYears ?? null,

      state: artisan.artisan?.state || "",
      lga: artisan.artisan?.lga || "",

      location: artisan.artisan?.location || null,
      portfolio: artisan.artisan?.portfolio || [],

      rating: artisan.ratingCount
        ? Math.round((artisan.ratingAvg || 0) * 10) / 10
        : null,

      reviewCount: artisan.ratingCount || 0,

      completedJobs:
        completedCountByArtisan.get(
          String(artisan._id)
        ) || 0,

      verified: true,
      available: artisan.artisan?.available !== false,
    })),

    meta: {
      candidateCount: artisans.length,
      limit,
      maximumLimit: MAX_CANDIDATES,
      generatedAt: new Date().toISOString(),
    },
  });
};
