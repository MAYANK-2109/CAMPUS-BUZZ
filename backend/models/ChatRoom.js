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
      unique: false,           // sparse unique enforced below
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

module.exports = mongoose.model('ChatRoom', ChatRoomSchema);
