/**
 * models/LibrarySeat.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A physical seat in the campus library.
 *
 * Seats are laid out as floor → section → seat number, e.g. "F1-A-07".
 * The seat catalogue is managed by Admins; students only read it.
 *
 * A seat is never deleted once it has bookings — it is deactivated instead,
 * so historical bookings keep pointing at a real seat document.
 */

const mongoose = require('mongoose');

const SEAT_TYPES = ['regular', 'computer', 'discussion', 'quiet'];

const LibrarySeatSchema = new mongoose.Schema(
  {
    /** Human-readable code, unique across the library — e.g. "F1-A-07" */
    code: {
      type:     String,
      required: [true, 'Seat code is required'],
      unique:   true,
      trim:     true,
      uppercase: true,
      maxlength: [20, 'Seat code too long'],
    },

    floor: {
      type:     Number,
      required: [true, 'Floor is required'],
      min:      [0, 'Floor cannot be negative'],
      index:    true,
    },

    /** Zone within a floor — e.g. "A", "B", "Reading Hall" */
    section: {
      type:     String,
      required: [true, 'Section is required'],
      trim:     true,
      maxlength: [40, 'Section name too long'],
    },

    seatType: {
      type:    String,
      enum:    { values: SEAT_TYPES, message: `Seat type must be one of: ${SEAT_TYPES.join(', ')}` },
      default: 'regular',
    },

    /** Has a power socket — students filter on this */
    hasPower: {
      type:    Boolean,
      default: false,
    },

    /**
     * Soft-delete. Deactivated seats disappear from the booking grid but keep
     * historical bookings intact.
     */
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },
  },
  { timestamps: true }
);

// Seat grid is always queried floor-then-section-then-code
LibrarySeatSchema.index({ isActive: 1, floor: 1, section: 1, code: 1 });

LibrarySeatSchema.statics.SEAT_TYPES = SEAT_TYPES;

module.exports = mongoose.model('LibrarySeat', LibrarySeatSchema);
