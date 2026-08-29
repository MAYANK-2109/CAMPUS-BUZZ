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
const HASHTAGS = ['None', '#foodsplit', '#cabsplit', '#resell', '#lost', '#found'];

const RideDetailsSchema = new mongoose.Schema(
  {
    from: {
      type:    String,
      trim:    true,
      default: 'NIT Raipur',
    },
    destination: {
      type:      String,
      trim:      true,
      maxlength: [120, 'Ride destination cannot exceed 120 characters'],
    },
    routeStops: {
      type:    [String],
      default: [],
    },
    vehicleType: {
      type:    String,
      enum:    ['cab', 'auto', 'shared_cab'],
      default: 'cab',
    },
    totalSeats: {
      type:    Number,
      min:     [2, 'A ride must have at least 2 total seats'],
      max:     [12, 'A ride cannot have more than 12 total seats'],
      default: 4,
    },
    departureTime: {
      type:    Date,
      default: null,
    },
  },
  { _id: false }
);

/**
 * Food Split details. Mirrors RideDetailsSchema above: a #foodsplit post with
 * this subdocument is a structured group order rather than a plain feed post,
 * and gets its own discovery page, join flow and close/cancel actions.
 */
const FoodDetailsSchema = new mongoose.Schema(
  {
    restaurant: {
      type:      String,
      trim:      true,
      maxlength: [120, 'Restaurant name cannot exceed 120 characters'],
    },

    /** Where the food is being brought to — hostel gate, block, room. */
    dropLocation: {
      type:      String,
      trim:      true,
      maxlength: [120, 'Drop location cannot exceed 120 characters'],
      default:   'NIT Raipur',
    },

    /**
     * When the order will be placed. This is the deadline that matters: after
     * it, joining is pointless because the order is already in. Used the same
     * way ride.departureTime is — as the post's natural expiry.
     */
    orderTime: {
      type:    Date,
      default: null,
    },

    /**
     * Cap on people sharing the order, creator included. Ranges wider than a
     * cab because a food order has no seats — the practical limit is how many
     * people one delivery can serve.
     */
    maxPeople: {
      type:    Number,
      min:     [2,  'A food split needs at least 2 people'],
      max:     [15, 'A food split cannot exceed 15 people'],
      default: 4,
    },

    /** Free-text, e.g. "Domino's", "biryani", "north indian" — shown as a chip. */
    cuisine: {
      type:      String,
      trim:      true,
      maxlength: [60, 'Cuisine cannot exceed 60 characters'],
      default:   '',
    },
  },
  { _id: false }
);

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

    /** Optional image URL. Posts without an image render text-only. */
    imageUrl: {
      type:    String,
      trim:    true,
      default: null,
    },

    /**
     * Cloudinary public_id for imageUrl, when the image was uploaded rather
     * than pasted. Stored because a URL alone cannot be deleted — without it
     * every image whose post is removed stays on the Cloudinary account
     * forever and the free tier fills with orphans.
     *
     * Null for pasted URLs, which we did not upload and must not delete.
     */
    imagePublicId: {
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
      type:     String,
      required: [true, 'Hashtag is mandatory'],
      enum:     {
        values:  HASHTAGS,
        message: `Hashtag must be one of: ${HASHTAGS.join(', ')}`,
      },
    },

    customTags: {
      type: [String],
      default: [],
    },

    /**
     * keywords: sanitised, stop-word-free tokens from title + description.
     * Written on create and refreshed on edit by utils/lostFoundMatcher.
     *
     * Stored rather than derived so #lost/#found matching is one indexed $in
     * lookup instead of re-tokenising every existing post on every submission.
     * Only meaningful for #lost and #found; other hashtags leave it empty.
     */
    keywords: {
      type:    [String],
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
     * totalFare: optional total cab fare amount (₹) for #cabsplit posts.
     * Displayed on the post card to help riders decide if they want to share.
     */
    totalFare: {
      type:    Number,
      default: null,
      min:     [0, 'Fare cannot be negative'],
    },

    /** Structured details used by the dedicated Ride Split search flow. */
    ride: {
      type:    RideDetailsSchema,
      default: null,
    },

    /**
     * food: present only on structured #foodsplit posts created through the
     * Food Split page. A plain #foodsplit feed post leaves this null and keeps
     * behaving exactly as before.
     */
    food: {
      type:    FoodDetailsSchema,
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

    /** Users @mentioned in the post description */
    mentions: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ],

    /** Set to true once the 30-min pre-expiry warning notification has been sent */
    expiryWarned: {
      type:    Boolean,
      default: false,
    },

    /**
     * moderation: verdict from the NLP pipeline (utils/moderation).
     *
     * Written on every create and update. A 'blocked' post never reaches the
     * database — the middleware rejects the request before Post.create — so the
     * only statuses seen here are the ones that were published:
     *
     *   clean     – pipeline found nothing actionable
     *   flagged   – published, but awaiting Admin review
     *   approved  – an Admin reviewed the flag and kept the post
     *   removed   – an Admin reviewed the flag and took the post down
     *
     * `scores` is kept as a raw object rather than a typed subdocument: the
     * category set is owned by utils/moderation/lexicon.js and will change as
     * the policy is tuned. Pinning it in the schema would mean a migration
     * every time a category is added.
     */
    moderation: {
      status: {
        type:    String,
        enum:    ['clean', 'flagged', 'approved', 'removed'],
        default: 'clean',
        index:   true,
      },
      primaryCategory: { type: String,  default: null },
      maxScore:        { type: Number,  default: 0 },
      scores:          { type: mongoose.Schema.Types.Mixed, default: {} },
      /** Which tier produced the verdict (1 lexical, 2 sentiment, 3 semantic). */
      tier:            { type: Number,  default: 0 },
      /** Human-readable justifications, shown to the reviewing Admin. */
      reasons:         { type: [String], default: [] },
      /** True when the post may indicate self-harm — routed to support, never enforcement. */
      requiresSupport: { type: Boolean, default: false },
      pipelineVersion: { type: String,  default: null },
      llmModel:        { type: String,  default: null },
      latencyMs:       { type: Number,  default: 0 },
      reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt:      { type: Date,    default: null },
    },

    /**
     * linkedEvent: optional reference to a calendar event.
     * Only populated for Club/Admin posts that are associated with
     * a specific campus event on the calendar.
     */
    linkedEvent: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Event',
      default: null,
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

// ── Ride Split search: destination / route overlap + upcoming departure ────
PostSchema.index({ hashtag: 1, 'ride.departureTime': 1, isActive: 1 });

// ── Index for the Admin moderation queue (flagged posts, newest first) ───────
PostSchema.index({ 'moderation.status': 1, createdAt: -1 });

// ── Food Split discovery: upcoming orders, soonest first ────────────────────
PostSchema.index({ hashtag: 1, isActive: 1, 'food.orderTime': 1 });

// ── Multikey index backing the #lost/#found keyword match ───────────────────
// Compound so the candidate scan is already narrowed to active posts of the
// opposite category before any keyword comparison happens.
PostSchema.index({ hashtag: 1, isActive: 1, keywords: 1 });

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
