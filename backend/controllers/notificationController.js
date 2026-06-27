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
    // Guard: req.user is populated by the `protect` middleware. If it is missing
    // the token/middleware chain is broken — return 401 instead of running a
    // query against an undefined _id (which would otherwise throw and look like
    // a dropped connection to the polling client).
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authenticated.', count: 0 });
    }

    const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    return res.status(200).json({ success: true, count });
  } catch (err) {
    console.error('[notificationController.getUnreadCount]', err.message);
    return res.status(500).json({ success: false, count: 0, message: 'Failed to fetch unread count.' });
  }
};
