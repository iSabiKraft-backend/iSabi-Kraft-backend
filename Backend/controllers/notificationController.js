import Notification from "../models/notificationModel.js";

const getMyNotifications = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const unreadOnly = String(req.query.unreadOnly).toLowerCase() === "true";

  const filter = { recipientID: req.user.id };
  if (unreadOnly) filter.readAt = null;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .populate("senderID", "firstName lastName")
      .populate("jobID", "title status")
      .populate("quoteID", "totalAmount status")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientID: req.user.id, readAt: null }),
  ]);

  return res.status(200).json({
    success: true,
    data: notifications,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    unreadCount,
  });
};

const markNotificationRead = async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientID: req.user.id },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ success: false, message: "Notification not found" });
  }

  return res.status(200).json({ success: true, data: notification });
};

const markAllNotificationsRead = async (req, res) => {
  const result = await Notification.updateMany(
    { recipientID: req.user.id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return res.status(200).json({
    success: true,
    message: "Notifications marked as read",
    modifiedCount: result.modifiedCount,
  });
};

export {
    getMyNotifications,
    markNotificationRead,
    markAllNotificationsRead,
};
