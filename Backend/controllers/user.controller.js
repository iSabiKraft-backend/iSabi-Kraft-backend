export const me = async (req, res) => {
  req.user.lastLoginAt = new Date();
  await req.user.save();
  const user = req.user.toObject();
  res.json({
    user: {
      ...user,
      name: user.fullName || "",
      role: req.role,
      lastLoginAt: user.lastLoginAt,
    },
    role: req.role,
  });
};

export const updateMe = async (req, res) => {
  const body = req.body || {};
  if (typeof body.fullName === "string") req.user.fullName = body.fullName.trim().slice(0, 80);
  if (typeof body.avatarUrl === "string" && /^https:\/\//.test(body.avatarUrl)) req.user.avatarUrl = body.avatarUrl;
  await req.user.save();
  res.json({ user: req.user.toJSON() });
};
