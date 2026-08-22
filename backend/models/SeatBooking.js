/**
 * models/SeatBooking.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One student holding one seat for one time slot on one day.
 *
 * Slots are fixed two-hour blocks (see SLOTS below) rather than free-form
 * ranges: it keeps the availability grid a simple lookup and avoids partial
 * overlap arithmetic on every read.
 *
 * `date` is stored as a plain "YYYY-MM-DD" string, deliberately NOT a Date.
 * A library day is a wall-clock day on campus; storing it as a Date would drag
 * the server's timezone into every comparison and make "today" ambiguous.
 *
 * Double-booking is prevented by a partial unique index (see below) rather than
 * an application-level check, so two concurrent requests cannot both win.
 */

const mongoose = require('mongoose');

// ── Fixed bookable slots (24h clock, campus local time) ──────────────────────
const SLOTS = [
  { id: 's1', label: '08:00 – 10:00', start: '08:00', end: '10:00' },
  { id: 's2', label: '10:00 – 12:00', start: '10:00', end: '12:00' },
  { id: 's3', label: '12:00 – 14:00', start: '12:00', end: '14:00' },
  { id: 's4', label: '14:00 – 16:00', start: '14:00', end: '16:00' },
  { id: 's5', label: '16:00 – 18:00', start: '16:00', end: '18:00' },
  { id: 's6', label: '18:00 – 20:00', start: '18:00', end: '20:00' },
  { id: 's7', label: '20:00 – 22:00', start: '20:00', end: '22:00' },
];

const SLOT_IDS = SLOTS.map(s => s.id);

// Booking lifecycle. 'booked' is the only status that occupies a seat.
const STATUSES = ['booked', 'checked_in', 'cancelled', 'expired', 'no_show'];
const ACTIVE_STATUSES = ['booked', 'checked_in'];

const SeatBookingSchema = new mongoose.Schema(
  {
    seat: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'LibrarySeat',
      required: [true, 'Seat reference is required'],
      index:    true,
    },

    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'User reference is required'],
      index:    true,
    },

    /** "YYYY-MM-DD" — see the note above on why this is a string */
    date: {
      type:     String,
      required: [true, 'Date is required'],
      match:    [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
      index:    true,
    },

    slotId: {
      type:     String,
      required: [true, 'Slot is required'],
      enum:     { values: SLOT_IDS, message: `Slot must be one of: ${SLOT_IDS.join(', ')}` },
    },

    status: {
      type:    String,
      enum:    { values: STATUSES, message: `Status must be one of: ${STATUSES.join(', ')}` },
      default: 'booked',
      index:   true,
    },

    checkedInAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * The core integrity guarantee: one active booking per (seat, date, slot).
 *
 * Partial index so cancelled/expired bookings do not block the seat from being
 * rebooked — only 'booked' and 'checked_in' rows participate in the constraint.
 * Enforcing this in the database means two simultaneous bookings cannot both
 * succeed; the loser gets a duplicate-key error, which the controller maps to
 * a friendly "seat was just taken" response.
 */
SeatBookingSchema.index(
  { seat: 1, date: 1, slotId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_STATUSES } },
    name: 'uniq_active_seat_slot',
  }
);

// A student may hold only one seat per slot — same reasoning, same mechanism.
SeatBookingSchema.index(
  { user: 1, date: 1, slotId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_STATUSES } },
    name: 'uniq_active_user_slot',
  }
);

// Availability grid lookup: "all active bookings for this date + slot"
SeatBookingSchema.index({ date: 1, slotId: 1, status: 1 });

SeatBookingSchema.statics.SLOTS           = SLOTS;
SeatBookingSchema.statics.SLOT_IDS        = SLOT_IDS;
SeatBookingSchema.statics.STATUSES        = STATUSES;
SeatBookingSchema.statics.ACTIVE_STATUSES = ACTIVE_STATUSES;

/** Look up a slot definition by id (returns undefined if unknown) */
SeatBookingSchema.statics.getSlot = function getSlot(slotId) {
  return SLOTS.find(s => s.id === slotId);
};

module.exports = mongoose.model('SeatBooking', SeatBookingSchema);
