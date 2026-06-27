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
    } else {
      // Defence-in-depth: exclude author at the DB projection level for non-Admins.
      // The serialisation step below also deletes obj.author — two independent layers.
      query = query.select('-author');
    }

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

// ── GET /api/complaints/mine ──────────────────────────────────────────────────
// Returns the MongoDB _id strings of every complaint filed by the current user.
exports.getMyComplaintIds = async (req, res) => {
  try {
    const mine = await Complaint.find({ author: req.user._id }).select('_id').lean();
    const ids  = mine.map((c) => String(c._id));
    return res.status(200).json({ success: true, data: ids });
  } catch (err) {
    console.error('[complaintController.getMyComplaintIds]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch your complaints.' });
  }
};

// ── PATCH /api/complaints/:id  (Admin or original author) ─────────────────────
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { status, declineReason } = req.body;

    const validStatuses = ['Open', 'Resolved', 'Declined', 'Resolved (Verified)'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}.`,
      });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const isAdmin = req.user.role === 'Admin';
    const isAuthor = complaint.author.toString() === req.user._id.toString();

    // Check authorization: Admin can set any status, student author can only verify or reopen
    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this complaint.' });
    }

    if (status === 'Declined' && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Only Admins can decline complaints.' });
    }

    if (status === 'Declined' && (!declineReason || !declineReason.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A reason must be provided when declining a complaint.',
      });
    }

    complaint.status = status;
    if (status === 'Declined') {
      complaint.declineReason = declineReason.trim();
    }
    await complaint.save();

    // Populate author details only for Admin
    let responseComplaint = complaint;
    if (isAdmin) {
      responseComplaint = await Complaint.findById(complaint._id).populate('author', 'displayName rollNo instituteEmail role');
    }

    const obj = responseComplaint.toObject();
    if (!isAdmin) {
      delete obj.author;
    }

    return res.status(200).json({ success: true, data: obj });
  } catch (err) {
    console.error('[complaintController.updateComplaintStatus]', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to update complaint.' });
  }
};

// ── POST /api/complaints/:id/upvote  (any authenticated user) ─────────────────
exports.upvoteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const userId   = req.user._id.toString();
    const hasVoted = complaint.upvotes.map(id => id.toString()).includes(userId);

    if (hasVoted) {
      complaint.upvotes = complaint.upvotes.filter(id => id.toString() !== userId);
    } else {
      complaint.upvotes.push(req.user._id);
    }

    await complaint.save();

    return res.status(200).json({
      success: true,
      upvotes: complaint.upvotes.length,
      upvoted: !hasVoted,
    });
  } catch (err) {
    console.error('[complaintController.upvoteComplaint]', err);
    return res.status(500).json({ success: false, message: 'Failed to toggle upvote.' });
  }
};

// ── GET /api/complaints/search  – title keyword search (for duplicate check) ──
// Stop words filtered client-side too, but we also ignore them server-side.
const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','has','have','had','be','been','being',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'of','in','on','at','to','for','with','by','from','as','into','through',
  'and','or','but','not','this','that','these','those','it','its','we','our',
  'i','my','me','you','your','they','their','he','she','his','her',
]);

exports.searchComplaints = async (req, res) => {
  try {
    const raw = (req.query.q || '').trim();
    if (!raw || raw.length < 3) {
      return res.json({ success: true, data: [] });
    }

    // Extract meaningful keywords
    const keywords = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    if (!keywords.length) return res.json({ success: true, data: [] });

    // Build OR regex query across keywords
    const regexes = keywords.map(k => new RegExp(k, 'i'));
    const complaints = await Complaint.find({
      title: { $in: regexes },
    })
      .select('_id title status upvotes createdAt')
      .sort({ upvotes: -1, createdAt: -1 })
      .limit(5)
      .lean();

    // Strip upvotes array, just return count
    const result = complaints.map(c => ({
      ...c,
      upvoteCount: (c.upvotes || []).length,
      upvotes: undefined,
    }));

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[complaintController.searchComplaints]', err);
    return res.status(500).json({ success: false, data: [] });
  }
};

// ── PATCH /api/complaints/:id/edit  (author only) ─────────────────────────────
exports.editComplaint = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title && !description) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    // Only the original author may edit
    if (complaint.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the author can edit this complaint.' });
    }

    if (title)       complaint.title       = title.trim();
    if (description) complaint.description = description.trim();
    complaint.isEdited = true;

    await complaint.save();

    // Strip author before returning (anonymity)
    const obj = complaint.toObject();
    delete obj.author;
    return res.status(200).json({ success: true, data: obj });
  } catch (err) {
    console.error('[complaintController.editComplaint]', err);
    return res.status(500).json({ success: false, message: 'Failed to edit complaint.' });
  }
};
