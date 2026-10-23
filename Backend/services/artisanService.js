import ArtisanProfile, { CORE_CATEGORIES } from "../models/artisanProfileModel.js";
import PortfolioItem from "../models/portfolioItemModel.js";
import User from "../models/userModel.js";
import { hashIdNumber, lastFourDigits } from "../utils/hashIdNumber.js";
import { httpError } from "../utils/httpError.js";
import { uploadBufferToCloudinary, deleteCloudinaryAsset } from "../utils/cloudinary.js";

// Only these fields may be written from a request body. Without this, an
// artisan could send {"verificationStatus":"approved","avgRating":5,"userId":...}.
const PROFILE_FIELDS = ["businessName", "bio", "yearsExperience", "categories", "state", "lga", "address"];
const PORTFOLIO_FIELDS = ["url", "type", "caption"];
const pick = (obj = {}, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


// Attach { user, portfolio } to each profile (Mongoose has no joins; two batched queries).
async function withRelations(profiles, { userFields, portfolioLimit } = {}) {
  const list = Array.isArray(profiles) ? profiles : [profiles];
  const ids = list.map((p) => p._id);

  const [users, items] = await Promise.all([
    User.find({ _id: { $in: list.map((p) => p.userId) } }).select(userFields || "firstName lastName createdAt"),
    PortfolioItem.find({ artisanProfileId: { $in: ids } }).sort({ createdAt: -1 }),
  ]);

  const userById = new Map(users.map((u) => [String(u._id), u.toJSON()]));
  const itemsByProfile = new Map();
  for (const item of items) {
    const key = String(item.artisanProfileId);
    const arr = itemsByProfile.get(key) || [];
    if (!portfolioLimit || arr.length < portfolioLimit) arr.push(item.toJSON());
    itemsByProfile.set(key, arr);
  }

  const result = list.map((p) => ({
    ...p.toJSON(),
    user: userById.get(String(p.userId)) || null,
    portfolio: itemsByProfile.get(String(p._id)) || [],
  }));
  return Array.isArray(profiles) ? result : result[0];
}

// GET /artisans?category=electrical&lga=Ikeja&minRating=4&verifiedOnly=true
// This is the query Dev 2's "Find Suitable Artisans" screen calls directly.
export async function searchArtisans({ category, lga, minRating = 0, verifiedOnly, page = 1, pageSize = 20 }) {
  if (category && !CORE_CATEGORIES.includes(category)) {
    throw httpError(`category must be one of: ${CORE_CATEGORIES.join(", ")}`, 400);
  }

  const filter = {
    isAcceptingJobs: true,
    avgRating: { $gte: Number(minRating) || 0 },
    ...(category && { categories: category }),
    ...(lga && { lga: new RegExp(`^${escapeRegex(lga)}$`, "i") }),
    ...(verifiedOnly === "true" && { verificationStatus: "approved" }),
  };

  const limit = Math.min(Number(pageSize) || 20, 50);
  const currentPage = Math.max(Number(page) || 1, 1);

  const [rows, total] = await Promise.all([
    ArtisanProfile.find(filter)
      .sort({ verificationTierRank: -1, avgRating: -1, _id: 1 })
      .skip((currentPage - 1) * limit)
      .limit(limit),
    ArtisanProfile.countDocuments(filter),
  ]);

  return { items: await withRelations(rows, { portfolioLimit: 3 }), total, page: currentPage, pageSize: limit };
}

// GET /artisans/:id — full profile detail, including portfolio
export async function getArtisanById(id) {
  const artisan = await ArtisanProfile.findById(id);
  if (!artisan) throw httpError("Artisan not found.", 404);
  return await withRelations(artisan);
}

// Create or update the logged-in artisan's profile. Does NOT touch
// portfolio or verification — those have their own, append-only service
// functions below so a profile edit can't accidentally wipe evidence a
// customer is relying on.
export async function upsertMyProfile(userId, profileData) {
  const data = pick(profileData, PROFILE_FIELDS);
  const profile = await ArtisanProfile.findOne({ userId });

  if (!profile) return await ArtisanProfile.create({ ...data, userId });

  profile.set(data);
  await profile.save();
  return profile;
}

// Append one portfolio item (PRD: mandatory portfolio).
export async function addPortfolioItem(userId, itemData) {
  const profile = await ArtisanProfile.findOne({ userId });
  if (!profile) throw httpError("Create your artisan profile first.", 404);

  return await PortfolioItem.create({ ...pick(itemData, PORTFOLIO_FIELDS), artisanProfileId: profile._id });
}

// Upload a portfolio image to Cloudinary and persist its URL/public ID.
export async function addPortfolioPhoto(userId, file, caption = null) {
  if (!file?.buffer) throw httpError('Attach an image in the "image" field.', 400);
  const profile = await ArtisanProfile.findOne({ userId });
  if (!profile) throw httpError("Create your artisan profile first.", 404);

  const uploaded = await uploadBufferToCloudinary(file.buffer, {
    folder: `isabikraft/artisans/${profile._id}/portfolio`,
    resourceType: "image",
  });

  try {
    return await PortfolioItem.create({
      artisanProfileId: profile._id,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      type: "photo",
      caption: caption || null,
    });
  } catch (error) {
    // Avoid orphaning the asset if the database write fails.
    await deleteCloudinaryAsset(uploaded.public_id, "image").catch((cleanupError) => {
      console.error("Failed to clean up unreferenced portfolio upload:", cleanupError.message);
    });
    throw error;
  }
}

// Submit NIN/BVN for manual review. Raw ID number is hashed before it ever
// touches the database — see utils/hashIdNumber.js.
export async function submitVerification(userId, { idType, idNumber }) {
  const profile = await ArtisanProfile.findOne({ userId });
  if (!profile) throw httpError("Create your artisan profile first.", 404);

  profile.set({
    verificationIdType: idType,
    verificationIdNumberHash: hashIdNumber(idNumber),
    verificationIdNumberLast4: lastFourDigits(idNumber),
    verificationStatus: "pending",
    verificationRejectionReason: null,
  });
  await profile.save();

  return { status: profile.verificationStatus };
}

// Admin: artisans awaiting manual verification review
export async function listPendingVerifications() {
  const profiles = await ArtisanProfile.find({ verificationStatus: "pending" }).sort({ updatedAt: 1 });
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select(
    "firstName lastName email phone selfieStatus"
  );
  const userById = new Map(users.map((u) => [String(u._id), u.toJSON()]));
  return profiles.map((p) => ({ ...p.toJSON(), user: userById.get(String(p.userId)) || null }));
}

// Admin: approve/reject + set tier
export async function reviewVerification(artisanId, adminId, { decision, tier, rejectionReason }) {
  const profile = await ArtisanProfile.findById(artisanId);
  if (!profile) throw httpError("Artisan not found.", 404);

  // An artisan can't be approved until their live selfie check has been approved
  // (turn off with REQUIRE_SELFIE_FOR_ARTISAN_APPROVAL=false).
  if (decision === "approved" && process.env.REQUIRE_SELFIE_FOR_ARTISAN_APPROVAL !== "false") {
    const owner = await User.findById(profile.userId).select("selfieStatus");
    if (owner?.selfieStatus !== "approved") {
      throw httpError("This artisan's live selfie verification must be approved first.", 409, {
        code: "SELFIE_REQUIRED",
        selfieStatus: owner?.selfieStatus ?? "not_started",
      });
    }
  }

  profile.set({
    verificationStatus: decision,
    verificationReviewedBy: adminId,
    verificationReviewedAt: new Date(),
    verificationTier: decision === "approved" ? tier || "basic" : "unverified",
    verificationRejectionReason: decision === "rejected" ? rejectionReason || null : null,
  });
  await profile.save();

  return profile;
}
