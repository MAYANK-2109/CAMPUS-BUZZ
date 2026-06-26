/**
 * models/Message.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Individual chat messages stored per ChatRoom.
 * Messages are persisted so users can see history when they join mid-session.
 */

const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    roomId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'ChatRoom',
      required: [true, 'Room reference is required'],
      index:    true,
    },

    senderId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Sender reference is required'],
    },

    text: {
      type:      String,
      required:  [true, 'Message text is required'],
      trim:      true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },

    timestamp: {
      type:    Date,
      default: () => new Date(),
      index:   true,
    },
  },
  {
    // We manage timestamp manually above (single field), skip auto-timestamps
    timestamps: false,
  }
);

// ── Compound index: fetch last N messages for a room efficiently ─────────────
MessageSchema.index({ roomId: 1, timestamp: -1 });

module.exports = mongoose.model('Message', MessageSchema);
