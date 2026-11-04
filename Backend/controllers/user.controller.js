export const me = (req, res) => res.json({ user: req.user, role: req.role });
