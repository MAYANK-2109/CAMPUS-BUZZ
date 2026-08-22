/**
 * models/ChatRoom.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Supports two modes:
 *
 * 1. Post-linked room (isGlobal: false) — legacy behaviour.
 *    One room per Post document. Socket.io uses postId as the room key.
 *
 * 2. Global / standalone room (isGlobal: true) — new hub rooms.
 *    Created by a user with a hashtag-style name.
 *    Auto-closes 2 hours after the last message (checked by cron).
 *    The creator (or an Admin) can also close it manually.
 */

const mongoose = require('mongoose');

const HASHTAG_SLUGS = [
  '#general', '#announcements', '#foodsplit', '#cabsplit', '#resell',
  '#lost', '#found', '#sports', '#tech', '#cultural', '#placement',
  '#hostel', '#library', '#events', '#misc',
];

const ChatRoomSchema = new mongoose.Schema(
  {
    // ── Post-linked mode ──────────────────────────────────────────────────────
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      index: true,
      default: null,
    },

    // ── Global room mode ──────────────────────────────────────────────────────
    isGlobal: {
      type: Boolean,
      default: false,
      index: true,
    },

    /** Display name — e.g. "Food Buddies" or the raw hashtag slug */
    name: {
      type: String,
      trim: true,
      maxlength: [60, 'Room name too long'],
      default: null,
    },

    /** Hashtag category — e.g. "#general", "#foodsplit" */
    hashtag: {
      type: String,
      trim: true,
      default: '#general',
    },

    /** The user who created this global room */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /** Timestamp of the last message — used by the inactivity-close cron */
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },

    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],

    /**
     * requiresApproval: when true, a user cannot enter the room until the
     * creator approves their join request. Set on every user-created room
     * (see POST /api/rooms). Legacy and post-linked rooms default to false,
     * so existing rooms stay open exactly as before.
     */
    requiresApproval: {
      type:    Boolean,
      default: false,
    },

    /**
     * joinRequests: one entry per user who has asked to join a gated room.
     * Kept as a status log rather than a plain pending list so the creator can
     * see who was declined and so a declined user cannot silently re-request.
     */
    joinRequests: [
      {
        user: {
          type:     mongoose.Schema.Types.ObjectId,
          ref:      'User',
          required: true,
        },
        status: {
          type:    String,
          enum:    ['pending', 'approved', 'declined'],
          default: 'pending',
        },
        requestedAt: { type: Date, default: Date.now },
        decidedAt:   { type: Date, default: null },
        decidedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ── Static: find or create a POST-linked room ────────────────────────────────
ChatRoomSchema.statics.findOrCreate = async function findOrCreate(postId) {
  let room = await this.findOne({ postId });
  if (!room) {
    room = await this.create({ postId, participants: [], isGlobal: false });
  }
  return room;
};

// ── Static: get list of allowed hashtag slugs ────────────────────────────────
ChatRoomSchema.statics.allowedHashtags = HASHTAG_SLUGS;

// ── Static: the one category whose rooms require creator approval to join ───
// Rooms under every other hashtag are open to anyone.
ChatRoomSchema.statics.APPROVAL_HASHTAG = '#general';

/**
 * Normalise a ref field to its id string.
 *
 * A ref may arrive as an ObjectId OR as a populated document, depending on the
 * caller. Calling .toString() on a populated document returns Mongoose's
 * inspect output, not the id — so comparing that against a user id silently
 * fails. Always go through this helper when comparing refs.
 */
const refId = (value) => {
  if (!value) return null;
  if (value._id) return value._id.toString();   // populated document
  return value.toString();                      // ObjectId / string
};

// ── Method: is this user the room's creator? ────────────────────────────────
ChatRoomSchema.methods.isCreator = function isCreator(userId) {
  const creator = refId(this.createdBy);
  const uid     = refId(userId);
  if (!creator || !uid) return false;
  return creator === uid;
};

// ── Method: find a user's join request (returns undefined if never asked) ───
ChatRoomSchema.methods.findRequest = function findRequest(userId) {
  const uid = refId(userId);
  if (!uid) return undefined;
  return (this.joinRequests || []).find(r => refId(r.user) === uid);
};

/**
 * Method: may this user enter the room?
 *
 * Open to everyone unless requiresApproval is set. On a gated room, entry is
 * limited to the creator, a site Admin, and users with an approved request.
 * Returns { allowed, reason, status } — reason is safe to show to the user.
 */
ChatRoomSchema.methods.canAccess = function canAccess(userId, userRole) {
  if (!this.isActive) {
    return { allowed: false, reason: 'This room is closed.', status: 'closed' };
  }
  if (!this.requiresApproval) {
    return { allowed: true, reason: null, status: 'open' };
  }
  if (this.isCreator(userId)) {
    return { allowed: true, reason: null, status: 'creator' };
  }
  if (userRole === 'Admin') {
    return { allowed: true, reason: null, status: 'admin' };
  }

  const request = this.findRequest(userId);
  if (!request) {
    return { allowed: false, reason: 'Request to join this room first.', status: 'none' };
  }
  if (request.status === 'approved') {
    return { allowed: true, reason: null, status: 'approved' };
  }
  if (request.status === 'pending') {
    return { allowed: false, reason: 'Your request to join is awaiting approval.', status: 'pending' };
  }
  return { allowed: false, reason: 'Your request to join this room was declined.', status: 'declined' };
};

module.exports = mongoose.model('ChatRoom', ChatRoomSchema);
