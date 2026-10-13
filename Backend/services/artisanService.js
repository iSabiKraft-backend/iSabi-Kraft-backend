import { Op } from "sequelize";
import ArtisanProfile from "../models/artisanProfileModel.js";
import PortfolioItem from "../models/portfolioItemModel.js";
import User from "../models/userModel.js";
import { hashIdNumber, lastFourDigits } from "../utils/hashIdNumber.js";

// GET /artisans?category=electrical&lga=Ikeja&minRating=4&verifiedOnly=true
// This is the query Dev 2's "Find Suitable Artisans" screen calls directly.
export async function searchArtisans({ category, lga, minRating = 0, verifiedOnly, page = 1, pageSize = 20 }) {
  const where = {
    isAcceptingJobs: true,
    avgRating: { [Op.gte]: Number(minRating) || 0 },
    ...(category && { categories: { [Op.contains]: [category] } }),
    ...(lga && { lga: { [Op.iLike]: lga } }),
    ...(verifiedOnly === "true" && { verificationStatus: "approved" }),
  };

  const take = Math.min(Number(pageSize) || 20, 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const { rows, count } = await ArtisanProfile.findAndCountAll({
    where,
    include: [
      { model: User, attributes: ["id", "firstName", "lastName", "createdAt"] },
      { model: PortfolioItem, limit: 3 },
    ],
    order: [
      ["verificationStatus", "DESC"],
      ["avgRating", "DESC"],
    ],
    limit: take,
    offset: skip,
    distinct: true, // keeps `count` correct alongside the PortfolioItem include
  });

  return { items: rows, total: count, page: Number(page) || 1, pageSize: take };
}

// GET /artisans/:id — full profile detail, including portfolio
export async function getArtisanById(id) {
  const artisan = await ArtisanProfile.findByPk(id, {
    include: [
      { model: User, attributes: ["id", "firstName", "lastName", "createdAt"] },
      { model: PortfolioItem },
    ],
  });

  if (!artisan) {
    const error = new Error("Artisan not found.");
    error.statusCode = 404;
    throw error;
  }

  return artisan;
}

// Create or update the logged-in artisan's profile. Does NOT touch
// portfolio or verification — those have their own, append-only service
// functions below so a profile edit can't accidentally wipe evidence a
// customer is relying on.
export async function upsertMyProfile(userId, profileData) {
  const [profile] = await ArtisanProfile.findOrCreate({
    where: { userId },
    defaults: { userId, ...profileData },
  });

  await profile.update(profileData);
  return profile;
}

// Append one portfolio item (PRD: mandatory portfolio).
export async function addPortfolioItem(userId, itemData) {
  const profile = await ArtisanProfile.findOne({ where: { userId } });

  if (!profile) {
    const error = new Error("Create your artisan profile first.");
    error.statusCode = 404;
    throw error;
  }

  return await PortfolioItem.create({ artisanProfileId: profile.id, ...itemData });
}

// Submit NIN/BVN for manual review. Raw ID number is hashed before it ever
// touches the database — see utils/hashIdNumber.js.
export async function submitVerification(userId, { idType, idNumber }) {
  const profile = await ArtisanProfile.findOne({ where: { userId } });

  if (!profile) {
    const error = new Error("Create your artisan profile first.");
    error.statusCode = 404;
    throw error;
  }

  await profile.update({
    verificationIdType: idType,
    verificationIdNumberHash: hashIdNumber(idNumber),
    verificationIdNumberLast4: lastFourDigits(idNumber),
    verificationStatus: "pending",
    verificationRejectionReason: null,
  });

  return { status: profile.verificationStatus };
}

// Admin: artisans awaiting manual verification review
export async function listPendingVerifications() {
  return await ArtisanProfile.findAll({
    where: { verificationStatus: "pending" },
    include: [{ model: User, attributes: ["id", "firstName", "lastName", "email", "phone"] }],
  });
}

// Admin: approve/reject + set tier
export async function reviewVerification(artisanId, adminId, { decision, tier, rejectionReason }) {
  const profile = await ArtisanProfile.findByPk(artisanId);

  if (!profile) {
    const error = new Error("Artisan not found.");
    error.statusCode = 404;
    throw error;
  }

  await profile.update({
    verificationStatus: decision,
    verificationReviewedBy: adminId,
    verificationReviewedAt: new Date(),
    verificationTier: decision === "approved" ? tier || "basic" : "unverified",
    verificationRejectionReason: decision === "rejected" ? rejectionReason || null : null,
  });

  return profile;
}
