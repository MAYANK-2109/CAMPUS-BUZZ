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

// ── GET /api/users/:id ───────────────────────────────────────────────────────
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('displayName avatarUrl role bio followers following createdAt rollNo instituteEmail');
      
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    // We can also fetch the post count or we can let the frontend fetch posts
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error('[userController.getUserProfile]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
};

// ── PATCH /api/users/change-password ─────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide both current and new password.' });
    }

    // Must fetch user with password to check
    const user = await User.findById(req.user._id).select('+passwordHash');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect current password.' });
    }

    // Update password
    user.passwordHash = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[userController.changePassword]', err);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};
