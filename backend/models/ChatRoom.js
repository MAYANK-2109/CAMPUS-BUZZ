/**
 * models/ChatRoom.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Each Post that supports chat (foodsplit, cabsplit, resell) gets exactly
 * one ChatRoom document. The Socket.io server uses postId as the room name.
 *
 * Lifecycle:
 *   1. Created lazily on the first user joining a post's chat.
 *   2. Deactivated (isActive = false) by the cron job when the parent Post
 *      is expired – prevents new messages after the post is gone.
 */

const mongoose = require('mongoose');

const ChatRoomSchema = new mongoose.Schema(
  {
    postId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Post',
      required: [true, 'Post reference is required'],
      unique:   true,   // One room per post, enforced at DB level
      index:    true,
    },

    /**
     * participants: array of User refs who have joined this room.
     * Updated whenever a user emits joinRoom on the socket.
     */
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref:  'User',
      },
    ],

    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },
  },
  {
    timestamps: true,
  }
);

// ── Static: find or create a room for a given postId ─────────────────────────
ChatRoomSchema.statics.findOrCreate = async function findOrCreate(postId) {
  let room = await this.findOne({ postId });
  if (!room) {
    room = await this.create({ postId, participants: [] });
  }
  return room;
};

module.exports = mongoose.model('ChatRoom', ChatRoomSchema);
