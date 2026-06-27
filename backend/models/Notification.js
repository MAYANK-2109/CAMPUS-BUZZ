/**
 * models/Notification.js
 */
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type:    String,
      enum:    ['like', 'dislike', 'comment', 'new_post', 'follow', 'mention', 'announcement', 'event_request', 'expiry_warning', 'report'],
      required: true,
    },
    post:         { type: mongoose.Schema.Types.ObjectId, ref: 'Post',         default: null },
    announcement: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', default: null },
    isRead:  { type: Boolean, default: false },
    message: { type: String, trim: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
