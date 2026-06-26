/**
 * models/Post.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Schema for user-generated campus posts.
 *
 * Hashtag enum drives the UI behavior on the frontend:
 *   #foodsplit / #cabsplit  → shows countdown timer + opens Socket.io chat
 *   #resell                 → opens Socket.io chat (no timer)
 *   #lost / #found          → expands modal with author contact (no chat)
 *   None                    → plain post, no extra UI
 *
 * The cron job (cron/postExpiry.js) soft-deletes posts with
 *   hashtag ∈ {#foodsplit, #cabsplit}  AND  expiresAt < now
 */

const mongoose = require('mongoose');

// ── Valid hashtag values ─────────────────────────────────────────────────────
const HASHTAGS = ['#foodsplit', '#cabsplit', '#resell', '#lost', '#found', 'None'];

const PostSchema = new mongoose.Schema(
  {
    title: {
      type:      String,
      required:  [true, 'Post title is required'],
      trim:      true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },

    description: {
      type:      String,
      required:  [true, 'Description is required'],
      trim:      true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    imageUrl: {
      type:    String,
      trim:    true,
      default: null,
    },

    author: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Author reference is required'],
    },

    hashtag: {
      type:    String,
      enum:    {
        values:  HASHTAGS,
        message: `Hashtag must be one of: ${HASHTAGS.join(', ')}`,
      },
      default: 'None',
    },

    customTags: {
      type: [String],
      default: [],
    },

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    /**
     * expiresAt: only meaningful for #foodsplit and #cabsplit.
     * The cron job uses this to determine when to deactivate the post.
     * Required when hashtag is time-sensitive (validated at controller level).
     */
    expiresAt: {
      type:    Date,
      default: null,
    },

    /**
     * Soft-delete flag. The cron job sets isActive = false instead of
     * removing documents, preserving chat history integrity.
     */
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,   // Frequently queried in feed + cron job
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound index: active posts sorted by creation date (main feed query) ──
PostSchema.index({ isActive: 1, createdAt: -1 });

// ── Index for cron job efficiency ────────────────────────────────────────────
PostSchema.index({ hashtag: 1, expiresAt: 1, isActive: 1 });

// ── Virtual: is this post currently expired? ─────────────────────────────────
PostSchema.virtual('isExpired').get(function isExpired() {
  if (!this.expiresAt) return false;
  return this.expiresAt < new Date();
});

// Ensure virtuals are serialised to JSON
PostSchema.set('toJSON', { virtuals: true });
PostSchema.set('toObject', { virtuals: true });

// ── Export hashtag constants so other modules can import them ────────────────
PostSchema.statics.HASHTAGS = HASHTAGS;

module.exports = mongoose.model('Post', PostSchema);
