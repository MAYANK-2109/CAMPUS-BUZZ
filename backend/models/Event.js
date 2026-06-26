/**
 * models/Event.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Campus events created by Club accounts or Admins.
 * Students can request events (status: 'Pending') which Admins can approve.
 */

const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema(
  {
    title: {
      type:      String,
      required:  [true, 'Event title is required'],
      trim:      true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },

    date: {
      type:     Date,
      required: [true, 'Event date is required'],
    },

    time: {
      type:     String,
      required: [true, 'Event time is required'],
      trim:     true,
    },

    venue: {
      type:      String,
      required:  [true, 'Venue is required'],
      trim:      true,
      maxlength: [200, 'Venue cannot exceed 200 characters'],
    },

    description: {
      type:      String,
      trim:      true,
      maxlength: [3000, 'Description cannot exceed 3000 characters'],
    },

    eventType: {
      type:    String,
      enum:    ['Online', 'Offline'],
      default: 'Offline',
    },

    meetingLink: {
      type: String,
      trim: true,
    },

    passcode: {
      type: String,
      trim: true,
    },

    mapLink: {
      type: String,
      trim: true,
    },

    /**
     * createdBy: Club or Admin accounts publish events.
     * Students submit event *requests* (status: 'Pending') which are
     * reviewed by Admins before becoming visible.
     */
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Creator reference is required'],
    },

    /**
     * status:
     *   'Approved'  – visible on the public calendar (Club/Admin-created or approved request)
     *   'Pending'   – student-submitted request awaiting Admin review
     *   'Rejected'  – request declined by Admin
     */
    status: {
      type:    String,
      enum:    ['Approved', 'Pending', 'Rejected'],
      default: 'Pending',
    },
  },
  {
    timestamps: true,
  }
);

// ── Index: calendar query – approved events in date range ────────────────────
EventSchema.index({ status: 1, date: 1 });

module.exports = mongoose.model('Event', EventSchema);
