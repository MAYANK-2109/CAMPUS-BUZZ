/**
 * models/SeatHold.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A short-lived claim on a seat while a student confirms their booking.
 *
 * Without this, two students can both be staring at the same "free" seat and
 * only discover the clash at the final click. The hold makes the seat visibly
 * unavailable to everyone else the moment someone starts checking out.
 *
 * ── Why expiry is checked in queries, not left to the TTL index ──────────────
 * MongoDB's TTL monitor only sweeps about once a minute, so a 30-second hold
 * would linger well past its deadline if we trusted TTL for correctness. Every
 * read therefore compares `expiresAt` against now, and the TTL index below is
 * only there to stop dead rows accumulating.
 *
 * ── Why there is a plain unique index ────────────────────────────────────────
 * "One *live* hold per seat/slot" cannot be expressed as a partial index —
 * liveness depends on the current time. Instead the index is unconditional and
 * the controller upserts with a filter that matches only expired holds or the
 * caller's own. A competing live hold fails that filter, the upsert attempts an
 * insert, and the unique index rejects it. Two racing holds cannot both win.
 */

const mongoose = require('mongoose');

// How long a student gets to confirm before the seat is released.
const HOLD_SECONDS = 30;

const SeatHoldSchema = new mongoose.Schema(
  {
    seat: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'LibrarySeat',
      required: true,
    },

    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    /** "YYYY-MM-DD" — same convention as SeatBooking */
    date: {
      type:     String,
      required: true,
      match:    [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    },

    slotId: {
      type:     String,
      required: true,
    },

    expiresAt: {
      type:     Date,
      required: true,
    },
  },
  { timestamps: true }
);

// One hold row per seat+slot. See the header note on why this is unconditional.
SeatHoldSchema.index({ seat: 1, date: 1, slotId: 1 }, { unique: true, name: 'uniq_hold_seat_slot' });

// Housekeeping only — never relied on for correctness.
SeatHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Grid lookup: live holds for a date+slot
SeatHoldSchema.index({ date: 1, slotId: 1, expiresAt: 1 });

SeatHoldSchema.statics.HOLD_SECONDS = HOLD_SECONDS;

/** Is this hold still live right now? */
SeatHoldSchema.methods.isLive = function isLive() {
  return this.expiresAt > new Date();
};

module.exports = mongoose.model('SeatHold', SeatHoldSchema);
