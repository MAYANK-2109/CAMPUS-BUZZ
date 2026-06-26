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
      enum:    ['like', 'dislike', 'comment', 'new_post', 'follow'],
      required: true,
    },
    post:    { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    isRead:  { type: Boolean, default: false },
    message: { type: String, trim: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
