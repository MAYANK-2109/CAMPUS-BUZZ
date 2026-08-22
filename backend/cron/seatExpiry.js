/**
 * cron/seatExpiry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Retires library bookings whose slot has finished.
 *
 *   status 'booked'      → 'no_show'   (reserved but never checked in)
 *   status 'checked_in'  → 'expired'   (attended, slot now over)
 *
 * Both are terminal, and neither is in ACTIVE_STATUSES — so the partial unique
 * index stops counting them and the seat frees up for future dates without any
 * extra bookkeeping.
 *
 * Runs every 10 minutes; slots are 2 hours long, so that is ample resolution.
 */

const cron        = require('node-cron');
const SeatBooking = require('../models/SeatBooking');

// Local wall-clock date key — must match the controller's definition.
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const retireFinishedBookings = async () => {
  try {
    const today   = todayKey();
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

    // Slots that have already ended today.
    const endedToday = SeatBooking.SLOTS
      .filter(s => nowMins >= toMinutes(s.end))
      .map(s => s.id);

    // Anything still active on an earlier date is finished by definition;
    // anything today is finished only if its slot has ended.
    const match = {
      status: { $in: SeatBooking.ACTIVE_STATUSES },
      $or: [
        { date: { $lt: today } },
        ...(endedToday.length ? [{ date: today, slotId: { $in: endedToday } }] : []),
      ],
    };

    const [noShows, expired] = await Promise.all([
      SeatBooking.updateMany({ ...match, status: 'booked' },     { status: 'no_show' }),
      SeatBooking.updateMany({ ...match, status: 'checked_in' }, { status: 'expired' }),
    ]);

    const total = (noShows.modifiedCount || 0) + (expired.modifiedCount || 0);
    if (total > 0) {
      console.log(`[CRON seatExpiry] retired ${total} booking(s) — ${noShows.modifiedCount} no-show, ${expired.modifiedCount} expired.`);
    }
  } catch (err) {
    console.error('[CRON seatExpiry]', err);
  }
};

const startSeatExpiryCron = () => {
  cron.schedule('*/10 * * * *', retireFinishedBookings);
  console.log('[CRON] Library seat expiry job scheduled (every 10 minutes).');
  // Sweep once at boot so a restart after downtime catches up immediately.
  retireFinishedBookings();
};

module.exports = { startSeatExpiryCron, retireFinishedBookings };
