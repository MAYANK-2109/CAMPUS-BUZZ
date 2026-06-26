/**
 * models/Comment.js
 */
const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
  {
    post:   { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text:   { type: String, required: true, trim: true, maxlength: [500, 'Comment cannot exceed 500 chars'] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', CommentSchema);
