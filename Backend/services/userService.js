import User from "../models/userModel.js";

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
  for (const key of ["firstName", "lastName", "phone"]) {
    if (updates[key] !== undefined) user[key] = updates[key];
  }
  await user.save();

  return user.toJSON();
}

// List users — admin only, backs the admin dashboard's user-management view
export async function listUsers({ role, page = 1, pageSize = 20 }) {
  const limit = Math.min(Number(pageSize) || 20, 100);
  const currentPage = Math.max(Number(page) || 1, 1);

  const filter = role ? { role: String(role) } : {};

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return { items, total, page: currentPage, pageSize: limit };
}

