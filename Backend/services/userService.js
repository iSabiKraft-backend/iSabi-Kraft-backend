import fs from "node:fs/promises";
import path from "node:path";
import User from "../models/userModel.js";
import { httpError } from "../utils/httpError.js";
import { normalizePhone, splitFullName } from "../utils/identifier.js";
import { resolveLocation } from "../utils/nigeriaLocations.js";
import { UPLOAD_ROOT } from "../middleware/uploadMiddleware.js";

// Get the logged-in user's own record
export async function getMe(userId) {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return user.toJSON();
}

// Update the logged-in user's own record. Only firstName/lastName/phone —
// email and role changes go through support, not a self-serve endpoint, to
// avoid account-takeover / privilege-escalation vectors.
export async function updateMe(userId, updates) {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  // Whitelist — never let a request body change role, email, isActive, etc.
  for (const key of ["firstName", "lastName"]) {
    if (updates[key] !== undefined) user[key] = updates[key];
  }
  if (updates.phone !== undefined) {
    const phone = normalizePhone(updates.phone);
    if (!phone) throw httpError("Provide a valid phone number.", 400);
    if (phone !== user.phone) {
      user.phone = phone;
      user.phoneVerified = false; // a new number has to be re-verified
    }
  }
  await user.save();

  return user.toJSON();
}

// Step 2 of 2 — "Complete Your Profile": name, state, LGA, date of birth, optional address.
export async function completeProfile(userId, { fullName, state, lga, dateOfBirth, address }) {
  const user = await User.findById(userId);
  if (!user) throw httpError("User not found.", 404);

  const location = resolveLocation(state, lga);
  if (!location) throw httpError("Choose a supported state and one of its LGAs.", 400);

  if (fullName) Object.assign(user, splitFullName(fullName));
  user.state = location.state;
  user.lga = location.lga;
  user.dateOfBirth = new Date(dateOfBirth);
  user.address = address || null;
  user.profileCompleted = true;
  await user.save();

  return user.toJSON();
}

// Profile photo. `file` comes from the upload middleware (already type/size checked).
export async function setAvatar(userId, file) {
  const user = await User.findById(userId);
  if (!user) {
    await fs.rm(file.path, { force: true });
    throw httpError("User not found.", 404);
  }

  const previous = user.avatarUrl;
  user.avatarUrl = `/uploads/avatars/${file.filename}`;
  await user.save();

  // Remove the old local file (never touches external URLs, e.g. a Google picture)
  if (previous?.startsWith("/uploads/avatars/")) {
    await fs.rm(path.join(UPLOAD_ROOT, "avatars", path.basename(previous)), { force: true });
  }
  return user.toJSON();
}

// List users — admin only, backs the admin dashboard's user-management view
export async function listUsers({ role, page = 1, pageSize = 20 }) {
  const limit = Math.min(Number(pageSize) || 20, 100);
  const currentPage = Math.max(Number(page) || 1, 1);

  const filter = ["customer", "artisan", "admin"].includes(role) ? { role } : {};

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return { items, total, page: currentPage, pageSize: limit };
}
