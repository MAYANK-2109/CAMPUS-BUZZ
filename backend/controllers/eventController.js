/**
 * controllers/eventController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Campus event management.
 *
 * GET    /api/events            → approved events (all roles); pending for Admin
 * POST   /api/events            → Club/Admin: auto-approved; Student: Pending
 * PATCH  /api/events/:id/status → Admin only: approve or reject requests
 * DELETE /api/events/:id        → Admin only
 */

const Event = require('../models/Event');

// ── GET /api/events ───────────────────────────────────────────────────────────
exports.getEvents = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'Admin';

    // Admins see all statuses; everyone else only sees Approved events
    const filter = isAdmin ? {} : { status: 'Approved' };

    // Optional date range filter: ?from=2024-01-01&to=2024-01-31
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to)   filter.date.$lte = new Date(req.query.to);
    }

    const events = await Event.find(filter)
      .sort({ date: 1 })
      .populate('createdBy', 'displayName role');

    return res.status(200).json({ success: true, data: events });
  } catch (err) {
    console.error('[eventController.getEvents]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch events.' });
  }
};

// ── POST /api/events ──────────────────────────────────────────────────────────
exports.createEvent = async (req, res) => {
  try {
    const { title, date, time, venue, description } = req.body;

    if (!title || !date || !time || !venue) {
      return res.status(400).json({
        success: false,
        message: 'title, date, time, and venue are required.',
      });
    }

    // Club/Admin submissions are immediately Approved; Students go Pending
    const status = ['Club', 'Admin'].includes(req.user.role) ? 'Approved' : 'Pending';

    const event = await Event.create({
      title,
      date:        new Date(date),
      time,
      venue,
      description: description || '',
      createdBy:   req.user._id,
      status,
    });

    await event.populate('createdBy', 'displayName role');

    return res.status(201).json({ success: true, data: event });
  } catch (err) {
    console.error('[eventController.createEvent]', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(422).json({ success: false, message: messages.join(' ') });
    }
    return res.status(500).json({ success: false, message: 'Failed to create event.' });
  }
};

// ── PATCH /api/events/:id/status  (Admin only) ───────────────────────────────
exports.updateEventStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be Approved, Rejected, or Pending.',
      });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate('createdBy', 'displayName role');

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    return res.status(200).json({ success: true, data: event });
  } catch (err) {
    console.error('[eventController.updateEventStatus]', err);
    return res.status(500).json({ success: false, message: 'Failed to update event status.' });
  }
};

// ── DELETE /api/events/:id  (Admin only) ─────────────────────────────────────
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    return res.status(200).json({ success: true, message: 'Event deleted.' });
  } catch (err) {
    console.error('[eventController.deleteEvent]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete event.' });
  }
};
