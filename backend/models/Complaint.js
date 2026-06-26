/**
 * models/Complaint.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Anonymous complaints submitted by students.
 *
 * Privacy rule (enforced in controller, NOT schema):
 *   - Students querying GET /complaints receive the list WITHOUT the author field.
 *   - Admins receive the full populated author.
 *
 * This keeps the logic in one place (controller) and the schema clean.
 */

const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema(
  {
    title: {
      type:      String,
      required:  [true, 'Complaint title is required'],
      trim:      true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },

    description: {
      type:      String,
      required:  [true, 'Description is required'],
      trim:      true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    author: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Author reference is required'],
    },

    status: {
      type:    String,
      enum:    {
        values:  ['Open', 'Resolved'],
        message: 'Status must be Open or Resolved',
      },
      default: 'Open',
      index:   true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Complaint', ComplaintSchema);
