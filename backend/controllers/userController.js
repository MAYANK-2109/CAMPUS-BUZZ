/**
 * controllers/userController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * User profile operations.
 */

const User = require('../models/User');

// ── PATCH /api/users/profile ─────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { displayName, bio, avatarUrl } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (displayName !== undefined) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

    await user.save();

    // Return safe user object
    const safeUser = {
      _id:            user._id,
      rollNo:         user.rollNo,
      instituteEmail: user.instituteEmail,
      role:           user.role,
      isVerified:     user.isVerified,
      displayName:    user.displayName,
      bio:            user.bio,
      avatarUrl:      user.avatarUrl,
      createdAt:      user.createdAt,
    };

    return res.status(200).json({ success: true, data: safeUser });
  } catch (err) {
    console.error('[userController.updateProfile]', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(422).json({ success: false, message: messages.join(' ') });
    }
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};
