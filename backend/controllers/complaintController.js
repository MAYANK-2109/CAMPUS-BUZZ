/**
 * controllers/complaintController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles campus complaints with role-dependent author visibility.
 *
 * GET  /api/complaints      → Students receive list WITHOUT author field.
 *                             Admins receive list WITH populated author.
 * POST /api/complaints      → Any authenticated user can file a complaint.
 * PATCH /api/complaints/:id → Admin only: update status (Open → Resolved).
 */

const Complaint = require('../models/Complaint');

// ── GET /api/complaints ───────────────────────────────────────────────────────
exports.getComplaints = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    // ── PRIVACY RULE ──────────────────────────────────────────────────────────
    // Admins receive complaints with author populated.
    // Students/Club accounts receive complaints without the author field.
    // This is enforced HERE in the controller, not in the schema.
    const isAdmin = req.user.role === 'Admin';

    let query = Complaint.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    if (isAdmin) {
      // Populate author details for Admin
      query = query.populate('author', 'displayName rollNo instituteEmail role');
    }
    // For non-Admins: do NOT populate author (keep field as ObjectId only)

    const [complaints, total] = await Promise.all([
      query.exec(),
      Complaint.countDocuments(filter),
    ]);

    // Strip author from the response payload for non-Admin users.
    // We use map() here instead of a Mongoose projection so the DB query
    // is identical – the only difference is what we serialise over the wire.
    const safeComplaints = isAdmin
      ? complaints
      : complaints.map((c) => {
          const obj = c.toObject();
          delete obj.author;   // <-- Author anonymised for Students/Club
          return obj;
        });

    return res.status(200).json({
      success: true,
      data:    safeComplaints,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[complaintController.getComplaints]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch complaints.' });
  }
};

// ── POST /api/complaints ──────────────────────────────────────────────────────
exports.createComplaint = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title and description are required.',
      });
    }

    const complaint = await Complaint.create({
      title,
      description,
      author: req.user._id,
      status: 'Open',
    });

    // Return the complaint without author populated (anonymity from creation)
    const { author: _stripped, ...safeComplaint } = complaint.toObject();

    return res.status(201).json({ success: true, data: safeComplaint });
  } catch (err) {
    console.error('[complaintController.createComplaint]', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(422).json({ success: false, message: messages.join(' ') });
    }
    return res.status(500).json({ success: false, message: 'Failed to file complaint.' });
  }
};

// ── PATCH /api/complaints/:id  (Admin only) ───────────────────────────────────
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['Open', 'Resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be Open or Resolved.',
      });
    }

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate('author', 'displayName rollNo instituteEmail role');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    return res.status(200).json({ success: true, data: complaint });
  } catch (err) {
    console.error('[complaintController.updateComplaintStatus]', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to update complaint.' });
  }
};
