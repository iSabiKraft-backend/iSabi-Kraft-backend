import fs from "node:fs/promises";
import path from "node:path";
import ArtisanProfile, { CORE_CATEGORIES, EXPERIENCE_LEVELS } from "../models/artisanProfileModel.js";
import PortfolioItem from "../models/portfolioItemModel.js";
import User from "../models/userModel.js";
import { hashIdNumber, lastFourDigits } from "../utils/hashIdNumber.js";
import { httpError } from "../utils/httpError.js";
import { resolveLocation } from "../utils/nigeriaLocations.js";
import { splitFullName } from "../utils/identifier.js";
import { notifyUser } from "./notificationService.js";
import { identityDir, MAX_DOCS, MAX_DOC_BYTES } from "../middleware/identityUploadMiddleware.js";
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

// ---------------------------------------------------------------------------------------------
// Artisan onboarding (Figma: Complete Your Profile -> Identity Verification -> Under Review)
// ---------------------------------------------------------------------------------------------

const reviewHours = () => process.env.REVIEW_SLA_HOURS || "24-48"; // "usually takes 24-48 hours"
const selfieRequired = () => process.env.REQUIRE_SELFIE_FOR_ARTISAN_APPROVAL !== "false";
const cap = (v) => v.charAt(0).toUpperCase() + v.slice(1);

// Fills the dropdowns / limits on the artisan screens.
export function getOptions() {
  return {
    tradeCategories: CORE_CATEGORIES.map((value) => ({ value, label: cap(value) })),
    experienceLevels: EXPERIENCE_LEVELS.map(({ value, label }) => ({ value, label })),
    bioMaxLength: 500,
    identityTypes: ["NIN", "BVN"],
    documents: { allowedTypes: ["image/jpeg", "image/png", "application/pdf"], maxSizeBytes: MAX_DOC_BYTES, maxFiles: MAX_DOCS },
    estimatedReviewHours: reviewHours(),
  };
}

// "Complete Your Profile" (artisan): photo is uploaded separately (POST /users/me/avatar).
export async function completeArtisanProfile(userId, { fullName, tradeCategory, experienceLevel, state, lga, bio, residentialAddress }) {
  const user = await User.findById(userId);
  if (!user) throw httpError("User not found.", 404);

  const location = resolveLocation(state, lga);
  if (!location) throw httpError("Choose a supported state and one of its LGAs.", 400);
  const level = EXPERIENCE_LEVELS.find((l) => l.value === experienceLevel);

  const profile = await ArtisanProfile.findOne({ userId }).select("+residentialAddress");
  // The admin is reviewing a snapshot of this profile; don't change it underneath them.
  if (profile?.verificationStatus === "pending") {
    throw httpError("Your profile can't be edited while it is under review.", 409, { code: "PROFILE_LOCKED" });
  }

  if (fullName) Object.assign(user, splitFullName(fullName));
  const fields = {
    categories: [tradeCategory],
    experienceLevel: level.value,
    yearsExperience: level.years,
    state: location.state,
    lga: location.lga,
    bio: bio?.trim() || null,
    residentialAddress: residentialAddress.trim(),
  };

  let saved = profile;
  if (profile) {
    profile.set(fields);
    await profile.save();
  } else {
    saved = await ArtisanProfile.create({
      ...fields,
      userId,
      businessName: `${user.firstName} ${user.lastName}`.trim(), // no "business name" on the design: default to their name
    });
  }

  Object.assign(user, { state: location.state, lga: location.lga, profileCompleted: true });
  await user.save();

  return await getMyProfile(userId);
}

// The owner's own view: includes the private residential address and document metadata.
export async function getMyProfile(userId) {
  const profile = await ArtisanProfile.findOne({ userId }).select("+residentialAddress +verificationDocuments");
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
  return profile.toJSON();
}

// Identity step: upload the NIN/BVN slip (front & back). Replaces any previously uploaded set.
// `files` come from the upload middleware (already type/size/signature checked, in staging).
export async function uploadIdentityDocuments(userId, files) {
  const discard = () => Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
  try {
    const profile = await ArtisanProfile.findOne({ userId }).select("+verificationDocuments");
    if (!profile) throw httpError("Complete your profile before uploading documents.", 404);
    if (["pending", "approved"].includes(profile.verificationStatus)) {
      throw httpError(
        profile.verificationStatus === "pending" ? "Your verification is already under review." : "You are already verified.",
        409
      );
    }

    const dir = identityDir(userId);
    const previous = profile.verificationDocuments.map((d) => d.filename);
    const documents = [];
    for (const file of files) {
      await fs.rename(file.path, path.join(dir, file.filename));
      documents.push({ filename: file.filename, mimeType: file.mimetype, sizeBytes: file.size, sha256: file.sha256, uploadedAt: new Date() });
    }
    profile.verificationDocuments = documents;
    await profile.save();

    await Promise.all(previous.map((name) => fs.rm(path.join(dir, path.basename(name)), { force: true })));
    return { documents: documents.map((d, index) => ({ index, mimeType: d.mimeType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt })) };
  } catch (error) {
    await discard();
    throw error;
  }
}

const ageOn = (dob, now = new Date()) => {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
};

// "Submit for Verification" — NIN/BVN + date of birth + consent. Needs the slip uploaded and the
// live selfie submitted first. Raw ID number is hashed before it touches the database — see
// utils/hashIdNumber.js. Goes to the admin queue as "pending".
export async function submitVerification(userId, { idType, idNumber, dateOfBirth, consent }) {
  const profile = await ArtisanProfile.findOne({ userId }).select("+verificationDocuments");
  if (!profile) throw httpError("Create your artisan profile first.", 404);

  if (profile.verificationStatus === "pending") throw httpError("Your verification is already under review.", 409);
  if (profile.verificationStatus === "approved") throw httpError("You are already verified.", 409);

  if (consent !== true && consent !== "true") throw httpError("You must consent to the verification of your NIN/BVN.", 400);

  const dob = new Date(dateOfBirth);
  const minAge = Number(process.env.MIN_ARTISAN_AGE || 18);
  if (ageOn(dob) < minAge) throw httpError(`You must be at least ${minAge} years old to register as an artisan.`, 400);

  const user = await User.findById(userId).select("selfieStatus");
  const missing = [];
  if (!profile.verificationDocuments.length) missing.push("documents");
  if (selfieRequired() && !["pending_review", "approved"].includes(user?.selfieStatus)) missing.push("selfie");
  if (missing.length) {
    throw httpError("Complete every verification step before submitting.", 422, { code: "VERIFICATION_INCOMPLETE", missing });
  }

  // One NIN/BVN can only back one active artisan account
  const hash = hashIdNumber(idNumber);
  const taken = await ArtisanProfile.exists({
    verificationIdNumberHash: hash,
    _id: { $ne: profile._id },
    verificationStatus: { $in: ["pending", "approved"] },
  });
  if (taken) throw httpError("This NIN/BVN is already registered to another account.", 409, { code: "ID_ALREADY_USED" });

  const now = new Date();
  // Atomic: only one of two parallel submits can move not_submitted/rejected -> pending
  const result = await ArtisanProfile.updateOne(
    { _id: profile._id, verificationStatus: { $in: ["not_submitted", "rejected"] } },
    {
      verificationIdType: idType,
      verificationIdNumberHash: hash,
      verificationIdNumberLast4: lastFourDigits(idNumber),
      verificationConsentAt: now,
      verificationSubmittedAt: now,
      verificationStatus: "pending",
      verificationRejectionReason: null,
      verificationDocsPurgeAfter: null,
    }
  );
  if (result.matchedCount === 0) throw httpError("Your verification is already under review.", 409);
  await User.updateOne({ _id: userId }, { dateOfBirth: dob });

  return { status: "pending", submittedAt: now, estimatedReviewHours: reviewHours() };
}

// Drives routing after login and the "Your Account is Under Review" screen (timeline + next steps).
export async function getOnboardingStatus(userId) {
  const [user, profile] = await Promise.all([
    User.findById(userId),
    ArtisanProfile.findOne({ userId }).select("+verificationDocuments"),
  ]);
  if (!user) throw httpError("User not found.", 404);

  const status = profile?.verificationStatus ?? "not_submitted";
  const steps = {
    accountVerified: Boolean(user.emailVerified || user.phoneVerified),
    profileCompleted: Boolean(profile),
    documentsUploaded: Boolean(profile?.verificationDocuments?.length),
    selfieSubmitted: ["pending_review", "approved"].includes(user.selfieStatus),
    submitted: ["pending", "approved", "rejected"].includes(status),
    approved: status === "approved",
  };

  let nextStep;
  if (!steps.accountVerified) nextStep = "verify_account";
  else if (!steps.profileCompleted) nextStep = "complete_profile";
  else if (status === "approved") nextStep = "approved";
  else if (status === "pending") nextStep = "under_review";
  else if (!steps.documentsUploaded) nextStep = "identity_verification"; // includes "rejected": re-upload and resubmit
  else if (selfieRequired() && !steps.selfieSubmitted) nextStep = "selfie";
  else nextStep = "ready_to_submit";
  if (status === "rejected" && nextStep === "identity_verification") nextStep = "rejected";

  const decided = status === "approved" || status === "rejected";
  return {
    nextStep,
    steps,
    verificationStatus: status,
    selfieStatus: user.selfieStatus,
    rejectionReason: status === "rejected" ? profile.verificationRejectionReason : null,
    estimatedReviewHours: reviewHours(),
    // The three rows of the timeline on the review screen
    timeline: {
      registration: { status: steps.submitted ? "completed" : "in_progress", at: profile?.verificationSubmittedAt ?? user.createdAt },
      review: { status: decided ? "completed" : status === "pending" ? "in_progress" : "not_started" },
      decision: { status: decided ? status : "pending", at: decided ? profile.verificationReviewedAt : null },
    },
  };
}

// Admin: artisans awaiting manual verification review
export async function listPendingVerifications() {
  const profiles = await ArtisanProfile.find({ verificationStatus: "pending" })
    .select("+residentialAddress +verificationDocuments")
    .sort({ verificationSubmittedAt: 1, updatedAt: 1 });
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select(
    "firstName lastName email phone selfieStatus dateOfBirth avatarUrl"
  );
  const userById = new Map(users.map((u) => [String(u._id), u.toJSON()]));
  return profiles.map((p) => ({ ...p.toJSON(), user: userById.get(String(p.userId)) || null }));
}

// Admin: stream-ready path for one uploaded ID document
export async function getDocumentFile(artisanId, index) {
  const profile = await ArtisanProfile.findById(artisanId).select("+verificationDocuments");
  const doc = profile?.verificationDocuments?.[Number(index)];
  if (!doc) throw httpError("Document not found.", 404);
  // filename is generated by us (hex + ext); basename() is belt and braces against path tricks
  return { file: path.join(identityDir(profile.userId), path.basename(doc.filename)), mimeType: doc.mimeType };
}

// Housekeeping (see server.js): delete ID documents once their retention window has passed.
export async function purgeIdentityDocuments() {
  const due = await ArtisanProfile.find({ verificationDocsPurgeAfter: { $lte: new Date() }, "verificationDocuments.0": { $exists: true } }).select("userId");
  for (const p of due) {
    await fs.rm(identityDir(p.userId), { recursive: true, force: true });
    await ArtisanProfile.updateOne({ _id: p._id }, { verificationDocuments: [], verificationDocsPurgeAfter: null });
  }
  return due.length;
}

// Admin: approve/reject + set tier
export async function reviewVerification(artisanId, adminId, { decision, tier, rejectionReason }) {
  const profile = await ArtisanProfile.findById(artisanId);
  if (!profile) throw httpError("Artisan not found.", 404);

  // Only a submitted profile can be decided. Without this an admin (or a mistaken call) could
  // approve an artisan who never uploaded an ID or took a selfie.
  if (profile.verificationStatus !== "pending") {
    throw httpError(
      profile.verificationStatus === "not_submitted"
        ? "This artisan has not submitted their verification yet."
        : "This verification has already been decided.",
      409,
      { code: profile.verificationStatus === "not_submitted" ? "NOT_SUBMITTED" : "ALREADY_DECIDED" }
    );
  }

  // An artisan can't be approved until their live selfie check has been approved
  // (turn off with REQUIRE_SELFIE_FOR_ARTISAN_APPROVAL=false).
  const owner = await User.findById(profile.userId);
  if (decision === "approved" && selfieRequired() && owner?.selfieStatus !== "approved") {
    throw httpError("This artisan's live selfie verification must be approved first.", 409, {
      code: "SELFIE_REQUIRED",
      selfieStatus: owner?.selfieStatus ?? "not_started",
    });
  }

  const approved = decision === "approved";
  const retentionDays = Number(process.env.ID_DOC_RETENTION_DAYS || 30);
  const now = new Date();

  // Atomic: two admins deciding at once can't both win
  const result = await ArtisanProfile.updateOne(
    { _id: profile._id, verificationStatus: "pending" },
    {
      verificationStatus: decision,
      verificationReviewedBy: adminId,
      verificationReviewedAt: now,
      verificationTier: approved ? tier || "basic" : "unverified",
      verificationRejectionReason: approved ? null : rejectionReason || null,
      // approved: keep the ID slip for the audit window then delete; rejected: delete now
      verificationDocsPurgeAfter: approved ? new Date(now.getTime() + retentionDays * 24 * 3600 * 1000) : now,
      ...(approved ? {} : { verificationDocuments: [] }),
    }
  );
  if (result.matchedCount === 0) throw httpError("This verification has already been decided.", 409, { code: "ALREADY_DECIDED" });
  if (!approved) await fs.rm(identityDir(profile.userId), { recursive: true, force: true });

  // "You'll be notified once the review is complete."
  if (owner) {
    await notifyUser(owner, approved
      ? { subject: "You're verified on iSabiKraft", text: "Good news! Your iSabiKraft artisan account has been verified. You can now receive job requests from customers." }
      : { subject: "Your iSabiKraft verification needs attention", text: `We couldn't verify your iSabiKraft account${rejectionReason ? `: ${rejectionReason}` : "."} Open the app to update your details and submit again.` });
  }

  return await ArtisanProfile.findById(profile._id);
}
