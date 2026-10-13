import User from "../models/userModel.js";

// Get the logged-in user's own record
export async function getMe(userId) {
  const user = await User.findByPk(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const userResponse = user.toJSON();
  delete userResponse.password;
  return userResponse;
}

// Update the logged-in user's own record. Only firstName/lastName/phone —
// email and role changes go through support, not a self-serve endpoint, to
// avoid account-takeover / privilege-escalation vectors.
export async function updateMe(userId, updates) {
  const user = await User.findByPk(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  await user.update(updates);

  const userResponse = user.toJSON();
  delete userResponse.password;
  return userResponse;
}

// List users — admin only, backs the admin dashboard's user-management view
export async function listUsers({ role, page = 1, pageSize = 20 }) {
  const take = Math.min(Number(pageSize) || 20, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = role ? { role } : {};

  const { rows, count } = await User.findAndCountAll({
    where,
    limit: take,
    offset: skip,
    order: [["createdAt", "DESC"]],
    attributes: { exclude: ["password"] },
  });

  return { items: rows, total: count, page: Number(page) || 1, pageSize: take };
}
