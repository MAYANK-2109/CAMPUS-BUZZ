/**
 * controllers/announcementController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all HTTP routes for announcements:
 *   GET    /api/announcements          – active announcements for current user
 *   POST   /api/announcements          – create (Club/Admin only)
 *   DELETE /api/announcements/:id      – soft-delete (own or Admin)
 *   POST   /api/announcements/:id/seen – mark as seen
 */

const Announcement = require('../models/Announcement');
const User         = require('../models/User');
const Notification = require('../models/Notification');
const { emitNotifications } = require('../socket');

// ── GET /api/announcements ─────────────────────────────────────────────────────
// Returns active announcements from clubs the current user follows, plus their own.
exports.getAnnouncements = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select('following role').lean();
    const authorIds = [...(me.following || []), req.user._id];

    const announcements = await Announcement.find({
      isActive:  true,
      expiresAt: { $gt: new Date() },
      author:    { $in: authorIds },
    })
      .populate('author', 'displayName avatarUrl role')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: announcements });
  } catch (err) {
    console.error('[GET /announcements]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch announcements.' });
  }
};

// ── POST /api/announcements ────────────────────────────────────────────────────
exports.createAnnouncement = async (req, res) => {
  try {
    const { text, imageUrl, durationHours } = req.body;
    const hours = Math.min(48, Math.max(1, parseInt(durationHours) || 24));

    if (!text?.trim() && !imageUrl?.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement must have text or an image.' });
    }

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const announcement = await Announcement.create({
      author:        req.user._id,
      text:          text?.trim() || '',
      imageUrl:      imageUrl?.trim() || null,
      durationHours: hours,
      expiresAt,
    });
    await announcement.populate('author', 'displayName avatarUrl role');

    // Fan-out notifications to all followers
    const author = await User.findById(req.user._id).select('followers displayName').lean();
    if (author.followers?.length > 0) {
      const notifs = author.followers.map(followerId => ({
        recipient:    followerId,
        sender:       req.user._id,
        type:         'announcement',
        announcement: announcement._id,
        message:      `${author.displayName} posted a new announcement.`,
      }));
      await emitNotifications(notifs);
    }

    return res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    console.error('[POST /announcements]', err);
    return res.status(500).json({ success: false, message: 'Failed to create announcement.' });
  }
};

// ── DELETE /api/announcements/:id ─────────────────────────────────────────────
exports.deleteAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found.' });

    if (ann.author.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }

    ann.isActive = false;
    await ann.save();
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /announcements/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete.' });
  }
};

// ── POST /api/announcements/:id/seen ─────────────────────────────────────────
exports.markSeen = async (req, res) => {
  try {
    await Announcement.updateOne(
      { _id: req.params.id },
      { $addToSet: { seenBy: req.user._id } }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
};
