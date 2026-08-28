/**
 * models/Complaint.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Anonymous complaints submitted by students.
 *
 * Privacy rule (enforced in controller, NOT schema):
 *   - Non-admins querying GET /complaints receive the list WITHOUT the author field.
 *   - Admins receive the populated author ONLY if their _id is in visibleToAdmins.
 *   - At least one admin must be listed in visibleToAdmins (enforced in controller).
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
        values:  ['Open', 'Resolved', 'Declined', 'Resolved (Verified)'],
        message: 'Status must be Open, Resolved, Declined, or Resolved (Verified)',
      },
      default: 'Open',
      index:   true,
    },

    declineReason: {
      type:    String,
      default: null,
      trim:    true,
      maxlength: [1000, 'Decline reason cannot exceed 1000 characters'],
    },

    upvotes: {
      type:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },

    isEdited: {
      type:    Boolean,
      default: false,
    },

    /**
     * visibleToAdmins
     * ───────────────
     * Array of Admin User _ids that the complaint submitter has explicitly
     * authorised to see their identity.  At least one entry is required
     * (enforced by the controller at creation time).
     *
     * All other users — including admins NOT in this list — receive the
     * complaint without any author information.
     */
    visibleToAdmins: {
      type:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Complaint', ComplaintSchema);
