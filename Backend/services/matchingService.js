import axios from "axios";
import Job from "../models/jobModel.js";
import ArtisanProfile from "../models/artisanProfileModel.js";
import User from "../models/userModel.js";

import PortfolioItem from "../models/portfolioItemModel.js";
import { CORE_CATEGORIES } from "../models/artisanProfileModel.js";

// Helper function that creates an Error object with an HTTP status code.
const createError = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

// Only approved artisans who are accepting jobs and match the job's
// category and state are considered.

// If the job specifies an area, the artisan's LGA must also match.
const buildCandidateFilter = (job) => ({
  isAcceptingJobs: true,
  categories: job.category,
  state: job.location?.state,
  ...(job.location?.area ? { lga: job.location.area } : {}),
  verificationStatus: "approved",
});

// Retrieves eligible artisans and prepares their profiles for AI matching.
const getCandidates = async (job) => {

  const profiles = await ArtisanProfile.find(buildCandidateFilter(job))
    .sort({
      verificationTierRank: -1,
      avgRating: -1,
      totalCompletedJobs: -1,
    })
    .limit(50)
    .lean();

  // Stop immediately if no eligible artisans are found.
  if (!profiles.length) return [];

  // Collect the user IDs and profile IDs needed for related database queries.
  const userIds = profiles.map((p) => p.userId).filter(Boolean);
  const profileIds = profiles.map((p) => p._id);

  // Fetch user names and portfolio items simultaneously to improve efficiency.
  const [users, portfolio] = await Promise.all([
    // Retrieve the first and last names of the candidate artisans.
    User.find({ _id: { $in: userIds } })
      .select("firstName lastName")
      .lean(),

    // Retrieve recent portfolio items belonging to the candidate profiles.
    PortfolioItem.find({ artisanProfileId: { $in: profileIds } })
      .sort({ createdAt: -1 })
      .limit(150)
      .lean(),
  ]);

  // Create a lookup map so each artisan's user details can be accessed quickly.
  const userById = new Map(
    users.map((u) => [String(u._id), u])
  );

  // Group portfolio items by artisan profile ID.
  const portfolioByProfile = new Map();

  for (const item of portfolio) {
    // Convert the profile ID into a consistent string key.
    const key = String(item.artisanProfileId);

    // Retrieve the existing portfolio array or create a new one.
    const arr = portfolioByProfile.get(key) || [];

    if (arr.length < 5) {
      arr.push({
        type: item.type,
        url: item.url,
        caption: item.caption || "",
      });
    }

    portfolioByProfile.set(key, arr);
  }

  return profiles.map((p) => ({
    artisanId: p.userId,
    artisanProfileId: p._id,
    profile: {
      businessName: p.businessName,
      bio: p.bio,
      yearsExperience: p.yearsExperience,
      categories: p.categories,
      state: p.state,
      lga: p.lga,
      address: p.address,
      verificationTier: p.verificationTier,
      avgRating: p.avgRating,
      totalReviews: p.totalReviews,
      totalCompletedJobs: p.totalCompletedJobs,
      isAcceptingJobs: p.isAcceptingJobs,

      // Attach the associated user details, if available.
      user: userById.get(String(p.userId)) || null,

      // Attach the artisan's portfolio, or an empty array if none exists.
      portfolio: portfolioByProfile.get(String(p._id)) || [],
    },
  }));
};


// The external AI matching service evaluates the job against the candidates.
const getRankedMatches = async (jobId, customerId) => {

  const job = await Job.findById(jobId).lean();

  if (!job) throw createError("Job not found", 404);

  if (String(job.customerID) !== String(customerId)) {
    throw createError("Only the job owner can request matches", 403);
  }

  if (job.status !== "open") {
    throw createError("Matches are only available for open jobs", 400);
  }
  if (job.status !== "open") {
    throw createError("Matches are only available for open jobs", 400);
  }

  // Prevent matching if an artisan has already been assigned to the job.
  if (job.artisanID) {
    throw createError(
      "An artisan has already been selected for this job",
      409
    );
  }

  // Retrieve eligible artisan profiles using the job's requirements.
  const candidates = await getCandidates(job);

  // If no candidates are available, return an empty result without
  // making an unnecessary request to the AI matching service.
  if (!candidates.length) {
    return {
      jobId: job._id,
      matches: [],
      message: "No suitable verified artisans are currently available.",
    };
  }

  // Read the AI matching service URL from the environment configuration.
  const url = process.env.AI_MATCHING_URL;

  // Return HTTP 503 if the external service has not been configured.
  if (!url) {
    throw createError("AI matching service is not configured", 503);
  }

  try {
    // Send the job details and eligible artisan profiles to the AI service.
    const response = await axios.post(
      url,
      {
        // Provide the information the AI needs to evaluate the job.
        job: {
          id: job._id,
          title: job.title,
          description: job.description,
          category: job.category,
          location: job.location,
          preferredStartDate: job.preferredStartDate,
        },

        // Supply the eligible artisans for evaluation.
        candidates,
      },
      {
        // Stop waiting if the AI service takes too long to respond.
        timeout: Number(process.env.AI_MATCHING_TIMEOUT_MS || 15000),

        // Set the request content type to JSON.
        headers: {
          "Content-Type": "application/json",

          // Include a bearer token only if an API key has been configured.
          ...(process.env.AI_MATCHING_API_KEY
            ? {
                Authorization: `Bearer ${process.env.AI_MATCHING_API_KEY}`,
              }
            : {}),
        },
      }
    );

    // Build a map of valid candidate IDs.
    const allowed = new Map(
      candidates.map((c) => [String(c.artisanId), c])
    );

    // Read the AI-generated matches, ensuring the response contains an array.
    const matches = (
      Array.isArray(response.data?.matches)
        ? response.data.matches
        : []
    )

      .filter((m) => allowed.has(String(m.artisanId)))

      .map((m) => ({
        artisanId: m.artisanId,
        score: Number(m.score),
        reasons: Array.isArray(m.reasons)
          ? m.reasons.slice(0, 8)
          : [],
        artisan: allowed.get(String(m.artisanId)).profile,
      }))
      .filter((m) => Number.isFinite(m.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); 
    return {
      jobId: job._id,
      matches,
      generatedBy: "ai",
    };
  } catch (error) {
    if (error.response?.status) {
      throw createError(
        "AI matching service failed to return matches",
        502
      );
    }
    if (error.code === "ECONNABORTED") {
      throw createError("AI matching service timed out", 504);
    }
    throw createError("AI matching service is unavailable", 503);
  }
};

export { getRankedMatches };