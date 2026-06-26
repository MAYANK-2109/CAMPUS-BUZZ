/**
 * controllers/notificationController.js
 */
const Notification = require('../models/Notification');

// ── GET /api/notifications ────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('sender', 'displayName avatarUrl role')
      .populate('post', 'title');

    return res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    console.error('[notificationController.getNotifications]', err);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ── PATCH /api/notifications/read ─────────────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notificationController.markAllRead]', err);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ── GET unread count ──────────────────────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    return res.status(200).json({ success: true, count });
  } catch (err) {
    return res.status(500).json({ success: false, count: 0 });
  }
};
