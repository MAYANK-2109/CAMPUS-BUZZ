/**
 * models/Announcement.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Instagram Stories-style ephemeral announcements.
 * Only Club and Admin users can create announcements.
 * Auto-expires between 1–48 hours after creation (set by creator).
 * Followers receive a push notification on create.
 */

const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema(
  {
    author: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    text: {
      type:      String,
      trim:      true,
      maxlength: [500, 'Announcement text cannot exceed 500 characters'],
      default:   '',
    },

    imageUrl: {
      type:    String,
      trim:    true,
      default: null,
    },

    /** Duration chosen by creator — stored for display purposes */
    durationHours: {
      type:    Number,
      min:     1,
      max:     48,
      default: 24,
    },

    /** Hard expiry timestamp */
    expiresAt: {
      type:     Date,
      required: true,
      index:    true,
    },

    /** Soft-delete / manual close */
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },

    /** Users who have already viewed this story */
    seenBy: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ],
  },
  { timestamps: true }
);

// Compound index for fast active-announcement queries
AnnouncementSchema.index({ isActive: 1, expiresAt: 1, author: 1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
