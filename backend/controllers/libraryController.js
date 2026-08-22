/**
 * controllers/libraryController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Library seat reservation.
 *
 *   GET    /api/library/slots                  – bookable time slots for a date
 *   GET    /api/library/seats                  – seat grid + availability
 *   POST   /api/library/bookings               – reserve a seat
 *   GET    /api/library/bookings/me            – my bookings
 *   PATCH  /api/library/bookings/:id/cancel    – cancel my booking
 *   PATCH  /api/library/bookings/:id/check-in  – mark arrival
 *
 *   Admin only:
 *   POST   /api/library/seats                  – add seat(s)
 *   PATCH  /api/library/seats/:id              – edit / deactivate a seat
 *   DELETE /api/library/seats/:id              – deactivate a seat
 *   GET    /api/library/bookings               – all bookings
 *   GET    /api/library/stats                  – occupancy dashboard
 *
 * Authentication is the app's existing JWT (`protect`), so a student who is
 * already signed in to Campus Buzz never logs in again for the library.
 */

const LibrarySeat = require('../models/LibrarySeat');
const SeatBooking = require('../models/SeatBooking');
const SeatHold    = require('../models/SeatHold');

const SLOTS = SeatBooking.SLOTS;

// ── Date helpers ─────────────────────────────────────────────────────────────
// The library day is a wall-clock day on campus. Build "YYYY-MM-DD" from local
// parts rather than toISOString(), which would shift the date across UTC.
const toDateKey = (d) => {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const todayKey = () => toDateKey(new Date());

const isValidDateKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Minutes since midnight for a "HH:MM" string */
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Has this slot already ended, on this date, right now? */
const slotHasPassed = (dateKey, slot) => {
  const today = todayKey();
  if (dateKey > today) return false;   // future date
  if (dateKey < today) return true;    // past date
  const now = new Date();
  return (now.getHours() * 60 + now.getMinutes()) >= toMinutes(slot.end);
};

// How far ahead students may book.
const MAX_ADVANCE_DAYS = 7;

const daysBetween = (aKey, bKey) =>
  Math.round((Date.parse(bKey) - Date.parse(aKey)) / 86_400_000);

/** Broadcast a seat-grid change so open clients update without polling. */
const emitSeatUpdate = (payload) => {
  const io = global._io;
  if (io) io.to('library').emit('librarySeatUpdate', payload);
};

// ── GET /api/library/slots ───────────────────────────────────────────────────
exports.getSlots = async (req, res) => {
  try {
    const date = req.query.date || todayKey();
    if (!isValidDateKey(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });
    }

    const totalSeats = await LibrarySeat.countDocuments({ isActive: true });

    // One grouped count instead of a query per slot.
    const counts = await SeatBooking.aggregate([
      { $match: { date, status: { $in: SeatBooking.ACTIVE_STATUSES } } },
      { $group: { _id: '$slotId', taken: { $sum: 1 } } },
    ]);
    const takenBySlot = Object.fromEntries(counts.map(c => [c._id, c.taken]));

    const data = SLOTS.map(s => {
      const taken = takenBySlot[s.id] || 0;
      return {
        ...s,
        taken,
        available: Math.max(0, totalSeats - taken),
        totalSeats,
        isPast: slotHasPassed(date, s),
      };
    });

    return res.json({ success: true, date, totalSeats, data });
  } catch (err) {
    console.error('[library.getSlots]', err);
    return res.status(500).json({ success: false, message: 'Failed to load slots.' });
  }
};

// ── GET /api/library/seats?date=&slotId= ─────────────────────────────────────
// Returns the full seat catalogue annotated with availability for that slot.
exports.getSeats = async (req, res) => {
  try {
    const date   = req.query.date || todayKey();
    const slotId = req.query.slotId;

    if (!isValidDateKey(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });
    }
    const slot = slotId ? SeatBooking.getSlot(slotId) : null;
    if (slotId && !slot) {
      return res.status(400).json({ success: false, message: 'Unknown slotId.' });
    }

    const seats = await LibrarySeat.find({ isActive: true })
      .sort({ floor: 1, section: 1, code: 1 })
      .lean();

    let bookingBySeat = {};
    let holdBySeat    = {};
    if (slot) {
      const [bookings, holds] = await Promise.all([
        SeatBooking.find({
          date,
          slotId,
          status: { $in: SeatBooking.ACTIVE_STATUSES },
        })
          .populate('user', 'displayName rollNo avatarUrl')
          .lean(),
        // Only live holds count — expired rows may still exist until the TTL
        // monitor sweeps them, so filter on time rather than on presence.
        SeatHold.find({ date, slotId, expiresAt: { $gt: new Date() } }).lean(),
      ]);

      bookingBySeat = Object.fromEntries(bookings.map(b => [b.seat.toString(), b]));
      holdBySeat    = Object.fromEntries(holds.map(h => [h.seat.toString(), h]));
    }

    const meId = req.user._id.toString();
    const data = seats.map(s => {
      const booking = bookingBySeat[s._id.toString()];
      const hold    = holdBySeat[s._id.toString()];
      // Who holds a seat is only revealed to Admins; students just see "taken".
      const isMine = booking ? booking.user?._id?.toString() === meId : false;
      const heldByMe = hold ? hold.user.toString() === meId : false;
      return {
        ...s,
        isBooked:  !!booking,
        isMine,
        bookingId: isMine ? booking._id : undefined,
        bookedBy:  (booking && req.user.role === 'Admin') ? booking.user : undefined,
        // A seat held by someone else is temporarily unavailable, not booked.
        isHeld:      !!hold && !heldByMe,
        heldByMe,
        holdExpires: heldByMe ? hold.expiresAt : undefined,
      };
    });

    return res.json({
      success: true,
      date,
      slotId: slotId || null,
      isPast: slot ? slotHasPassed(date, slot) : false,
      data,
    });
  } catch (err) {
    console.error('[library.getSeats]', err);
    return res.status(500).json({ success: false, message: 'Failed to load seats.' });
  }
};

// ── POST /api/library/holds ──────────────────────────────────────────────────
// Claim a seat for HOLD_SECONDS while the student confirms.
exports.holdSeat = async (req, res) => {
  try {
    const { seatId, date, slotId } = req.body;
    if (!seatId || !date || !slotId) {
      return res.status(400).json({ success: false, message: 'seatId, date and slotId are required.' });
    }
    if (!isValidDateKey(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });
    }
    const slot = SeatBooking.getSlot(slotId);
    if (!slot) return res.status(400).json({ success: false, message: 'Unknown slotId.' });
    if (slotHasPassed(date, slot)) {
      return res.status(400).json({ success: false, message: 'That slot has already ended.' });
    }

    const seat = await LibrarySeat.findById(seatId);
    if (!seat || !seat.isActive) {
      return res.status(404).json({ success: false, message: 'Seat not found.' });
    }

    // Already booked? No point holding it.
    const taken = await SeatBooking.exists({
      seat: seat._id, date, slotId, status: { $in: SeatBooking.ACTIVE_STATUSES },
    });
    if (taken) {
      return res.status(409).json({ success: false, message: 'That seat is already booked for this slot.' });
    }

    // Do we already hold a seat in this slot? Checking here rather than only at
    // confirm time matters: without it the student is granted a hold, watches a
    // 30-second countdown, and is refused at the last click — while that hold
    // needlessly blocks the seat for everyone else.
    const ownSeat = await SeatBooking.findOne({
      user: req.user._id, date, slotId, status: { $in: SeatBooking.ACTIVE_STATUSES },
    }).populate('seat', 'code');
    if (ownSeat) {
      return res.status(409).json({
        success: false,
        reason: 'own_booking',
        seatCode: ownSeat.seat?.code,
        message: `You already have seat ${ownSeat.seat?.code || ''} booked for this slot. Cancel it first to move seats.`.replace('  ', ' '),
      });
    }

    const now       = new Date();
    const expiresAt = new Date(now.getTime() + SeatHold.HOLD_SECONDS * 1000);

    // The filter matches only an expired hold or one we already own. A live
    // hold by someone else fails it, so the upsert falls through to an insert
    // and the unique index rejects it — see the note in models/SeatHold.js.
    let hold;
    try {
      hold = await SeatHold.findOneAndUpdate(
        {
          seat: seat._id, date, slotId,
          $or: [{ expiresAt: { $lte: now } }, { user: req.user._id }],
        },
        { $set: { user: req.user._id, expiresAt }, $setOnInsert: { seat: seat._id, date, slotId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Someone else is booking that seat right now. Try another, or retry in a moment.',
        });
      }
      throw err;
    }

    emitSeatUpdate({
      date, slotId, seatId: seat._id.toString(),
      isHeld: true, holdBy: req.user._id.toString(),
    });

    return res.status(201).json({
      success: true,
      data: {
        seatId:    seat._id,
        seatCode:  seat.code,
        date, slotId,
        expiresAt: hold.expiresAt,
        holdSeconds: SeatHold.HOLD_SECONDS,
      },
    });
  } catch (err) {
    console.error('[library.holdSeat]', err);
    return res.status(500).json({ success: false, message: 'Failed to hold seat.' });
  }
};

// ── DELETE /api/library/holds ────────────────────────────────────────────────
// Student backed out of checkout — release the seat immediately.
exports.releaseHold = async (req, res) => {
  try {
    const { seatId, date, slotId } = req.body;
    if (!seatId || !date || !slotId) {
      return res.status(400).json({ success: false, message: 'seatId, date and slotId are required.' });
    }

    // Only ever delete our own hold.
    const removed = await SeatHold.findOneAndDelete({
      seat: seatId, date, slotId, user: req.user._id,
    });

    if (removed) {
      emitSeatUpdate({ date, slotId, seatId: String(seatId), isHeld: false });
    }
    return res.json({ success: true, released: !!removed });
  } catch (err) {
    console.error('[library.releaseHold]', err);
    return res.status(500).json({ success: false, message: 'Failed to release hold.' });
  }
};

// ── POST /api/library/bookings ───────────────────────────────────────────────
exports.createBooking = async (req, res) => {
  try {
    const { seatId, date, slotId } = req.body;

    if (!seatId || !date || !slotId) {
      return res.status(400).json({ success: false, message: 'seatId, date and slotId are required.' });
    }
    if (!isValidDateKey(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });
    }

    const slot = SeatBooking.getSlot(slotId);
    if (!slot) {
      return res.status(400).json({ success: false, message: 'Unknown slotId.' });
    }
    if (slotHasPassed(date, slot)) {
      return res.status(400).json({ success: false, message: 'That slot has already ended.' });
    }

    const ahead = daysBetween(todayKey(), date);
    if (ahead < 0) {
      return res.status(400).json({ success: false, message: 'Cannot book a date in the past.' });
    }
    if (ahead > MAX_ADVANCE_DAYS) {
      return res.status(400).json({
        success: false,
        message: `Bookings open only ${MAX_ADVANCE_DAYS} days in advance.`,
      });
    }

    const seat = await LibrarySeat.findById(seatId);
    if (!seat || !seat.isActive) {
      return res.status(404).json({ success: false, message: 'Seat not found.' });
    }

    // Respect a live hold belonging to someone else. This is a courtesy check
    // layered on top of the unique index, not a substitute for it — the index
    // is still what makes the final insert race-safe.
    const rivalHold = await SeatHold.findOne({
      seat: seat._id, date, slotId,
      expiresAt: { $gt: new Date() },
      user: { $ne: req.user._id },
    });
    if (rivalHold) {
      return res.status(409).json({
        success: false,
        message: 'Someone else is booking that seat right now. Try another, or retry in a moment.',
      });
    }

    // The unique partial indexes are the real guard against double-booking;
    // creating and catching the duplicate-key error is what makes two
    // simultaneous requests resolve correctly.
    let booking;
    try {
      booking = await SeatBooking.create({
        seat:   seat._id,
        user:   req.user._id,
        date,
        slotId,
        status: 'booked',
      });
    } catch (err) {
      if (err.code === 11000) {
        // Which constraint tripped tells us which message to show.
        const seatClash = err.message.includes('uniq_active_seat_slot');
        return res.status(409).json({
          success: false,
          message: seatClash
            ? 'That seat was just taken for this slot. Pick another.'
            : 'You already have a seat booked for this slot.',
        });
      }
      throw err;
    }

    await booking.populate([
      { path: 'seat', select: 'code floor section seatType hasPower' },
      { path: 'user', select: 'displayName rollNo avatarUrl' },
    ]);

    // The booking supersedes the hold; drop it so the row does not linger.
    await SeatHold.deleteOne({ seat: seat._id, date, slotId, user: req.user._id });

    emitSeatUpdate({ date, slotId, seatId: seat._id.toString(), isBooked: true, isHeld: false });

    return res.status(201).json({ success: true, data: booking });
  } catch (err) {
    console.error('[library.createBooking]', err);
    if (err.name === 'ValidationError') {
      return res.status(422).json({
        success: false,
        message: Object.values(err.errors).map(e => e.message).join(' '),
      });
    }
    return res.status(500).json({ success: false, message: 'Failed to book seat.' });
  }
};

// ── GET /api/library/bookings/me ─────────────────────────────────────────────
exports.getMyBookings = async (req, res) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.upcoming === 'true') {
      filter.date   = { $gte: todayKey() };
      filter.status = { $in: SeatBooking.ACTIVE_STATUSES };
    }

    const bookings = await SeatBooking.find(filter)
      .populate('seat', 'code floor section seatType hasPower')
      .sort({ date: -1, slotId: -1 })
      .limit(100)
      .lean();

    const data = bookings.map(b => ({ ...b, slot: SeatBooking.getSlot(b.slotId) }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[library.getMyBookings]', err);
    return res.status(500).json({ success: false, message: 'Failed to load your bookings.' });
  }
};

// ── PATCH /api/library/bookings/:id/cancel ───────────────────────────────────
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await SeatBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const isOwner = booking.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Not authorised to cancel this booking.' });
    }
    if (!SeatBooking.ACTIVE_STATUSES.includes(booking.status)) {
      return res.status(409).json({ success: false, message: `This booking is already ${booking.status}.` });
    }

    booking.status      = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    emitSeatUpdate({
      date:   booking.date,
      slotId: booking.slotId,
      seatId: booking.seat.toString(),
      isBooked: false,
      isHeld:   false,
    });

    return res.json({ success: true, message: 'Booking cancelled.', data: booking });
  } catch (err) {
    console.error('[library.cancelBooking]', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
  }
};

// ── PATCH /api/library/bookings/:id/check-in ─────────────────────────────────
exports.checkIn = async (req, res) => {
  try {
    const booking = await SeatBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not your booking.' });
    }
    if (booking.status === 'checked_in') {
      return res.status(409).json({ success: false, message: 'Already checked in.' });
    }
    if (booking.status !== 'booked') {
      return res.status(409).json({ success: false, message: `This booking is ${booking.status}.` });
    }
    if (booking.date !== todayKey()) {
      return res.status(400).json({ success: false, message: 'You can only check in on the day of your booking.' });
    }

    booking.status      = 'checked_in';
    booking.checkedInAt = new Date();
    await booking.save();

    return res.json({ success: true, message: 'Checked in.', data: booking });
  } catch (err) {
    console.error('[library.checkIn]', err);
    return res.status(500).json({ success: false, message: 'Failed to check in.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/library/seats ──────────────────────────────────────────────────
// Accepts a single seat, or { floor, section, count } to generate a row.
exports.createSeats = async (req, res) => {
  try {
    const { code, floor, section, seatType, hasPower, count } = req.body;

    if (floor === undefined || !section?.trim()) {
      return res.status(400).json({ success: false, message: 'floor and section are required.' });
    }

    // Bulk mode: generate `count` sequential seats for this floor/section.
    if (count) {
      const n = parseInt(count, 10);
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        return res.status(400).json({ success: false, message: 'count must be between 1 and 200.' });
      }

      // Continue numbering after whatever already exists in this section.
      const existing = await LibrarySeat.countDocuments({ floor, section: section.trim() });
      const docs = Array.from({ length: n }, (_, i) => ({
        code:     `F${floor}-${section.trim().toUpperCase().replace(/\s+/g, '')}-${String(existing + i + 1).padStart(2, '0')}`,
        floor,
        section:  section.trim(),
        seatType: seatType || 'regular',
        hasPower: !!hasPower,
      }));

      // ordered:false so one duplicate code does not abort the whole batch
      const created = await LibrarySeat.insertMany(docs, { ordered: false })
        .catch(err => {
          if (err.writeErrors) return err.insertedDocs || [];
          throw err;
        });

      return res.status(201).json({
        success: true,
        message: `${created.length} seat(s) created.`,
        data: created,
      });
    }

    if (!code?.trim()) {
      return res.status(400).json({ success: false, message: 'code is required (or pass count to bulk-create).' });
    }

    const seat = await LibrarySeat.create({
      code: code.trim(),
      floor,
      section: section.trim(),
      seatType: seatType || 'regular',
      hasPower: !!hasPower,
    });

    return res.status(201).json({ success: true, data: seat });
  } catch (err) {
    console.error('[library.createSeats]', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A seat with that code already exists.' });
    }
    if (err.name === 'ValidationError') {
      return res.status(422).json({
        success: false,
        message: Object.values(err.errors).map(e => e.message).join(' '),
      });
    }
    return res.status(500).json({ success: false, message: 'Failed to create seat(s).' });
  }
};

// ── PATCH /api/library/seats/:id ─────────────────────────────────────────────
exports.updateSeat = async (req, res) => {
  try {
    const seat = await LibrarySeat.findById(req.params.id);
    if (!seat) return res.status(404).json({ success: false, message: 'Seat not found.' });

    ['code', 'floor', 'section', 'seatType', 'hasPower', 'isActive'].forEach(f => {
      if (req.body[f] !== undefined) seat[f] = req.body[f];
    });
    await seat.save();

    return res.json({ success: true, data: seat });
  } catch (err) {
    console.error('[library.updateSeat]', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A seat with that code already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to update seat.' });
  }
};

// ── DELETE /api/library/seats/:id ────────────────────────────────────────────
// Deactivates rather than deletes, so historical bookings stay resolvable.
exports.deleteSeat = async (req, res) => {
  try {
    const seat = await LibrarySeat.findById(req.params.id);
    if (!seat) return res.status(404).json({ success: false, message: 'Seat not found.' });

    seat.isActive = false;
    await seat.save();

    // Release any future bookings that were holding this seat.
    const released = await SeatBooking.updateMany(
      { seat: seat._id, date: { $gte: todayKey() }, status: { $in: SeatBooking.ACTIVE_STATUSES } },
      { status: 'cancelled', cancelledAt: new Date() }
    );

    return res.json({
      success: true,
      message: `Seat deactivated. ${released.modifiedCount} upcoming booking(s) released.`,
    });
  } catch (err) {
    console.error('[library.deleteSeat]', err);
    return res.status(500).json({ success: false, message: 'Failed to remove seat.' });
  }
};

// ── GET /api/library/bookings (admin) ────────────────────────────────────────
exports.getAllBookings = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);

    const filter = {};
    if (req.query.date)   filter.date   = req.query.date;
    if (req.query.slotId) filter.slotId = req.query.slotId;
    if (req.query.status) filter.status = req.query.status;

    const [bookings, total] = await Promise.all([
      SeatBooking.find(filter)
        .populate('seat', 'code floor section')
        .populate('user', 'displayName rollNo instituteEmail avatarUrl')
        .sort({ date: -1, slotId: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SeatBooking.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: bookings.map(b => ({ ...b, slot: SeatBooking.getSlot(b.slotId) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[library.getAllBookings]', err);
    return res.status(500).json({ success: false, message: 'Failed to load bookings.' });
  }
};

// ── GET /api/library/stats (admin) ───────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const date = req.query.date || todayKey();
    if (!isValidDateKey(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });
    }

    const [totalSeats, perSlot, perFloor, statusMix] = await Promise.all([
      LibrarySeat.countDocuments({ isActive: true }),

      SeatBooking.aggregate([
        { $match: { date, status: { $in: SeatBooking.ACTIVE_STATUSES } } },
        { $group: { _id: '$slotId', booked: { $sum: 1 } } },
      ]),

      SeatBooking.aggregate([
        { $match: { date, status: { $in: SeatBooking.ACTIVE_STATUSES } } },
        { $lookup: { from: 'libraryseats', localField: 'seat', foreignField: '_id', as: 'seatDoc' } },
        { $unwind: '$seatDoc' },
        { $group: { _id: '$seatDoc.floor', booked: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      SeatBooking.aggregate([
        { $match: { date } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const bookedBySlot = Object.fromEntries(perSlot.map(s => [s._id, s.booked]));
    const slotStats = SLOTS.map(s => {
      const booked = bookedBySlot[s.id] || 0;
      return {
        ...s,
        booked,
        free: Math.max(0, totalSeats - booked),
        occupancyPct: totalSeats ? Math.round((booked / totalSeats) * 100) : 0,
      };
    });

    const totalActive = perSlot.reduce((sum, s) => sum + s.booked, 0);
    const capacity    = totalSeats * SLOTS.length;

    return res.json({
      success: true,
      date,
      data: {
        totalSeats,
        totalBookings: totalActive,
        capacity,
        overallOccupancyPct: capacity ? Math.round((totalActive / capacity) * 100) : 0,
        slotStats,
        floorStats:  perFloor.map(f => ({ floor: f._id, booked: f.booked })),
        statusMix:   Object.fromEntries(statusMix.map(s => [s._id, s.count])),
      },
    });
  } catch (err) {
    console.error('[library.getStats]', err);
    return res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  DIGITAL LIBRARY ID  (QR)
//
//  The card carries a signed, short-lived JWT rather than a bare user id.
//  A raw id in a QR code would let anyone who photographs a card mint their
//  own; signing means only this server can issue one, and the short lifetime
//  means a screenshot shared later is already dead.
// ════════════════════════════════════════════════════════════════════════════

const jwt    = require('jsonwebtoken');
const QRCode = require('qrcode');

// Long enough to walk to the gate, short enough that a shared screenshot is
// useless. The frontend refreshes the card before it lapses.
const ID_TOKEN_TTL_SECONDS = 300;   // 5 minutes

// ── GET /api/library/id-card ─────────────────────────────────────────────────
exports.getIdCard = async (req, res) => {
  try {
    const token = jwt.sign(
      { uid: req.user._id.toString(), typ: 'libcard' },
      process.env.JWT_SECRET,
      { expiresIn: ID_TOKEN_TTL_SECONDS }
    );

    // Rendered server-side to a data URI so the page stays self-contained and
    // needs no QR library in the browser bundle.
    const qrDataUrl = await QRCode.toDataURL(token, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#1e1b4b', light: '#ffffff' },
    });

    // Today's booking, if any — handy for the person on the desk.
    const todaysBooking = await SeatBooking.findOne({
      user: req.user._id,
      date: todayKey(),
      status: { $in: SeatBooking.ACTIVE_STATUSES },
    }).populate('seat', 'code floor section').lean();

    return res.json({
      success: true,
      data: {
        user: {
          _id:            req.user._id,
          displayName:    req.user.displayName,
          rollNo:         req.user.rollNo,
          role:           req.user.role,
          instituteEmail: req.user.instituteEmail,
          avatarUrl:      req.user.avatarUrl || null,
        },
        qrDataUrl,
        expiresIn: ID_TOKEN_TTL_SECONDS,
        expiresAt: new Date(Date.now() + ID_TOKEN_TTL_SECONDS * 1000),
        todaysBooking: todaysBooking
          ? { ...todaysBooking, slot: SeatBooking.getSlot(todaysBooking.slotId) }
          : null,
      },
    });
  } catch (err) {
    console.error('[library.getIdCard]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate library ID.' });
  }
};

// ── POST /api/library/verify-id  (Admin) ─────────────────────────────────────
// Scan endpoint for the library desk: hand it the QR payload, get the holder.
exports.verifyIdCard = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Distinguish "card lapsed" from "not one of ours" — the desk needs to
      // know whether to ask for a refresh or refuse entry.
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        valid:   false,
        reason:  expired ? 'expired' : 'invalid',
        message: expired
          ? 'This library ID has expired. Ask the student to refresh it.'
          : 'Not a valid library ID.',
      });
    }

    // A login JWT must not double as a library card.
    if (payload.typ !== 'libcard') {
      return res.status(401).json({
        success: false, valid: false, reason: 'wrong_type',
        message: 'That code is not a library ID.',
      });
    }

    const User = require('../models/User');
    const holder = await User.findById(payload.uid)
      .select('displayName rollNo role instituteEmail avatarUrl')
      .lean();
    if (!holder) {
      return res.status(404).json({ success: false, valid: false, reason: 'no_user', message: 'Student not found.' });
    }

    const booking = await SeatBooking.findOne({
      user: holder._id,
      date: todayKey(),
      status: { $in: SeatBooking.ACTIVE_STATUSES },
    }).populate('seat', 'code floor section').lean();

    return res.json({
      success: true,
      valid:   true,
      data: {
        user: holder,
        todaysBooking: booking ? { ...booking, slot: SeatBooking.getSlot(booking.slotId) } : null,
      },
    });
  } catch (err) {
    console.error('[library.verifyIdCard]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify library ID.' });
  }
};

// Exported for the expiry cron
exports._helpers = { todayKey, toDateKey, toMinutes, slotHasPassed };
