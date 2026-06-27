/**
 * controllers/eventController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Campus event management.
 *
 * GET    /api/events              → approved events (all roles); pending for Admin
 * POST   /api/events              → Club/Admin: auto-approved; Student: Pending
 * POST   /api/events/request      → Student event request (notifies selected Admins)
 * PATCH  /api/events/:id/status   → Admin only: approve or reject requests
 * POST   /api/events/:id/rsvp     → toggle RSVP for current user
 * DELETE /api/events/:id          → Admin only
 */

const Event = require('../models/Event');
const { emitNotifications } = require('../socket');

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
    const { title, date, time, venue, description, eventType, meetingLink, passcode, mapLink } = req.body;

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
      eventType:   eventType || 'Offline',
      meetingLink: meetingLink || '',
      passcode:    passcode || '',
      mapLink:     mapLink || '',
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

// ── POST /api/events/request (Students only) ─────────────────────────────────
exports.requestEvent = async (req, res) => {
  try {
    const { title, description, date, adminIds } = req.body;
    
    if (!title || !description || !date || !adminIds || !adminIds.length) {
      return res.status(400).json({ success: false, message: 'All fields and at least one Admin are required.' });
    }

    const User = require('../models/User');

    // Verify selected users are actually admins
    const selectedAdmins = await User.find({ _id: { $in: adminIds }, role: 'Admin' });
    
    if (!selectedAdmins.length) {
      return res.status(400).json({ success: false, message: 'No valid admins selected.' });
    }

    const eventDate = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const message = `Event Request from ${req.user.displayName}: "${title}" on ${eventDate}. Description: ${description}`;

    const notifs = selectedAdmins.map(admin => ({
      recipient: admin._id,
      sender:    req.user._id,
      type:      'event_request',
      message:   message,
    }));

    await emitNotifications(notifs);

    return res.status(200).json({ success: true, message: 'Event request sent successfully.' });
  } catch (err) {
    console.error('[eventController.requestEvent]', err);
    return res.status(500).json({ success: false, message: 'Failed to send event request.' });
  }
};

// ── POST /api/events/:id/rsvp — toggle RSVP ──────────────────────────────────
exports.toggleRsvp = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const uid    = req.user._id.toString();
    const joined = event.rsvps.map(id => id.toString()).includes(uid);

    if (joined) {
      event.rsvps = event.rsvps.filter(id => id.toString() !== uid);
    } else {
      event.rsvps.push(req.user._id);
    }
    await event.save();

    return res.json({ success: true, rsvpCount: event.rsvps.length, rsvped: !joined });
  } catch (err) {
    console.error('[eventController.toggleRsvp]', err);
    return res.status(500).json({ success: false, message: 'Failed to toggle RSVP.' });
  }
};
