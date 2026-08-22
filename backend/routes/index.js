/**
 * routes/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central router that mounts all API sub-routes.
 * All routes are protected by the `protect` middleware (JWT verification).
 * Role-specific routes apply additional `requireRole` guards.
 *
 * Mount point: /api  (set in server.js)
 *
 * Final route map:
 *   POST   /api/auth/register
 *   POST   /api/auth/login
 *   GET    /api/auth/me
 *
 *   GET    /api/posts
 *   POST   /api/posts
 *   GET    /api/posts/:id
 *   PATCH  /api/posts/:id
 *   DELETE /api/posts/:id
 *
 *   GET    /api/events
 *   POST   /api/events
 *   PATCH  /api/events/:id/status
 *   DELETE /api/events/:id
 *
 *   GET    /api/complaints
 *   POST   /api/complaints
 *   PATCH  /api/complaints/:id
 */

const router = require('express').Router();

// ── Middleware imports ────────────────────────────────────────────────────────
const { protect }                       = require('../middleware/auth');
const { requireRole, adminOnly, clubOrAdmin } = require('../middleware/rbac');

// ── Controller imports ────────────────────────────────────────────────────────
const authController          = require('../controllers/authController');
const postController          = require('../controllers/postController');
const eventController         = require('../controllers/eventController');
const complaintController     = require('../controllers/complaintController');
const interactionController   = require('../controllers/interactionController');
const notificationController  = require('../controllers/notificationController');
const libraryController       = require('../controllers/libraryController');
const userRoutes              = require('./userRoutes');

// ── Model imports for inline route handlers ────────────────────────────────────
const User         = require('../models/User');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');

// ════════════════════════════════════════════════════════════════════════════════
// AUTH routes  (/api/auth/…)  — registration and login are public
// ════════════════════════════════════════════════════════════════════════════════
router.post('/auth/register', authController.register);
router.post('/auth/login',    authController.login);
router.post('/auth/verify-otp', authController.verifyOtp);
router.post('/auth/resend-otp', authController.resendOtp);
router.post('/auth/forgot-password', authController.forgotPassword);
router.patch('/auth/reset-password/:token', authController.resetPassword);
router.get( '/auth/me',       protect, authController.getMe);

// ════════════════════════════════════════════════════════════════════════════════
// POST routes  (/api/posts/…)
// ════════════════════════════════════════════════════════════════════════════════
/**
 * GET  /api/posts        – paginated feed (all authenticated users)
 *   ?feed=club           – filters to posts by Club/Admin accounts
 *   ?hashtag=#foodsplit  – filter by specific hashtag
 *
 * POST /api/posts        – create a post
 *   Students can post to the general feed.
 *   Club feed posts are gated by requireRole(['Club','Admin']) at the
 *   controller level via query param / frontend routing.
 */
router.get('/posts',      protect, postController.getPosts);
router.post('/posts',     protect, postController.createPost);
// ── GET /api/posts/trending-hashtags ─────────────────────────────────────────
router.get('/posts/trending-hashtags', protect, async (req, res) => {
  try {
    const Post = require('../models/Post');
    const trends = await Post.aggregate([
      { $match: { isActive: true, hashtag: { $exists: true } } },
      { $group: { _id: '$hashtag', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { hashtag: '$_id', count: 1, _id: 0 } },
    ]);
    return res.json({ success: true, data: trends });
  } catch (err) {
    console.error('[GET /posts/trending-hashtags]', err);
    return res.status(500).json({ success: false, data: [] });
  }
});

router.get('/posts/:id',  protect, postController.getPostById);
router.patch('/posts/:id',  protect, postController.updatePost);
router.delete('/posts/:id', protect, postController.deletePost);

// Post interactions
router.post('/posts/:id/like',        protect, interactionController.toggleLike);
router.post('/posts/:id/dislike',     protect, interactionController.toggleDislike);
router.post('/posts/:id/save',        protect, interactionController.toggleSavePost);
router.get('/posts/:id/comments',     protect, interactionController.getComments);
router.post('/posts/:id/comments',    protect, interactionController.addComment);
router.post('/users/:id/follow',      protect, interactionController.followClub);

// ── POST /api/posts/:id/report — flag a post for admin review ────────────────
// Any authenticated non-author user can report a post.
// A 'report' notification is sent to every Admin account.
router.post('/posts/:id/report', protect, async (req, res) => {
  try {
    const Post = require('../models/Post');
    const post = await Post.findById(req.params.id).select('_id title author isActive');
    if (!post || !post.isActive) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Authors cannot report their own posts
    if (post.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot report your own post.' });
    }

    // Fetch all Admin user IDs
    const admins = await User.find({ role: 'Admin' }).select('_id').lean();
    if (!admins.length) {
      // No admins to notify — still acknowledge the report gracefully
      return res.status(200).json({ success: true, message: 'Report submitted.' });
    }

    // Fan-out a notification to each Admin
    const notifs = admins.map(admin => ({
      recipient: admin._id,
      sender:    req.user._id,
      type:      'report',
      post:      post._id,
      message:   `${req.user.displayName} reported a post: "${post.title}"`,
    }));
    await Notification.insertMany(notifs);

    return res.status(200).json({ success: true, message: 'Report submitted. Our team will review it.' });
  } catch (err) {
    console.error('[POST /posts/:id/report]', err);
    return res.status(500).json({ success: false, message: 'Failed to submit report.' });
  }
});


// ════════════════════════════════════════════════════════════════════════════════
// EVENT routes  (/api/events/…)
// ════════════════════════════════════════════════════════════════════════════════
/**
 * GET  /api/events              – all authenticated users (Approved only for Students)
 * POST /api/events              – all authenticated users
 *   Club/Admin → status auto-Approved
 *   Student    → status Pending (event request)
 * PATCH /api/events/:id/status  – Admin only: approve / reject requests
 * DELETE /api/events/:id        – Admin only
 */
router.get('/events',                protect,             eventController.getEvents);
router.post('/events',               protect,             eventController.createEvent);
router.post('/events/request',       protect,             eventController.requestEvent);
router.patch('/events/:id/status',   protect, adminOnly,  eventController.updateEventStatus);
router.delete('/events/:id',         protect, adminOnly,  eventController.deleteEvent);

// ── POST /api/events/:id/rsvp — toggle RSVP ──────────────────────────────────
router.post('/events/:id/rsvp', protect, async (req, res) => {
  try {
    const Event = require('../models/Event');
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const uid     = req.user._id.toString();
    const joined  = event.rsvps.map(id => id.toString()).includes(uid);

    if (joined) {
      event.rsvps = event.rsvps.filter(id => id.toString() !== uid);
    } else {
      event.rsvps.push(req.user._id);
    }
    await event.save();

    return res.json({ success: true, rsvpCount: event.rsvps.length, rsvped: !joined });
  } catch (err) {
    console.error('[POST /events/:id/rsvp]', err);
    return res.status(500).json({ success: false, message: 'Failed to toggle RSVP.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// COMPLAINT routes  (/api/complaints/…)
// ════════════════════════════════════════════════════════════════════════════════
/**
 * GET  /api/complaints        – Students receive list WITHOUT author (anonymised).
 *                               Admins receive list WITH populated author.
 * GET  /api/complaints/search – keyword search for duplicate detection (open to all)
 * POST /api/complaints        – any authenticated user
 * POST /api/complaints/:id/upvote – toggle upvote (any authenticated user)
 * PATCH /api/complaints/:id   – Admin only: update status (Open / Resolved / Declined)
 * PATCH /api/complaints/:id/edit – Author only: edit title/description
 */
router.get('/complaints/mine',   protect,            complaintController.getMyComplaintIds);
router.get('/complaints/search', protect, complaintController.searchComplaints);
router.get('/complaints',        protect, complaintController.getComplaints);
router.post('/complaints',       protect, complaintController.createComplaint);
router.post('/complaints/:id/upvote',  protect, complaintController.upvoteComplaint);
router.patch('/complaints/:id/edit',   protect, complaintController.editComplaint);
router.patch('/complaints/:id',        protect,            complaintController.updateComplaintStatus);

// ════════════════════════════════════════════════════════════════════════════════
// CLUBS route  (/api/clubs)  – list all Club/Admin accounts for search & follow
// ════════════════════════════════════════════════════════════════════════════════
router.get('/clubs', protect, async (req, res) => {
  try {
    const clubs = await User.find({ role: { $in: ['Club', 'Admin'] } })
      .select('displayName avatarUrl role followers following bio')
      .sort({ displayName: 1 });
    return res.json({ success: true, data: clubs });
  } catch (err) {
    console.error('[clubs]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch clubs.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// CHAT ROOM routes  (/api/chat-rooms/…  and  /api/rooms/…)
// ════════════════════════════════════════════════════════════════════════════════
const ChatRoom = require('../models/ChatRoom');
const Message  = require('../models/Message');
const { emitNotifications } = require('../socket');

// ── Legacy: close a post-linked room ─────────────────────────────────────────
router.patch('/chat-rooms/:postId/close', protect, async (req, res) => {
  try {
    const Post = require('../models/Post');
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const isAuthor = post.author.toString() === req.user._id.toString();
    if (!isAuthor && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only the post author can close this room.' });
    }

    const room = await ChatRoom.findOne({ postId: req.params.postId });
    if (!room)          return res.status(404).json({ success: false, message: 'Chat room not found.' });
    if (!room.isActive) return res.status(400).json({ success: false, message: 'Room is already closed.' });

    room.isActive = false;
    await room.save();
    return res.status(200).json({ success: true, message: 'Chat room closed.' });
  } catch (err) {
    console.error('[chat-rooms/close]', err);
    return res.status(500).json({ success: false, message: 'Failed to close chat room.' });
  }
});

// ── GET /api/rooms — list all active rooms (global + post-linked) ─────────────
router.get('/rooms', protect, async (req, res) => {
  try {
    // 1. Global hub rooms
    const globalRooms = await ChatRoom.find({ isGlobal: true, isActive: true })
      .populate('createdBy', 'displayName avatarUrl role')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();

    // 2. Post-linked chat rooms (active posts with a chat hashtag)
    const postRooms = await ChatRoom.find({ isGlobal: false, isActive: true, postId: { $ne: null } })
      .populate('createdBy', 'displayName avatarUrl role')
      .populate('postId', 'title hashtag author')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();

    // Normalise post-linked rooms so the frontend can tell them apart
    const normalisedPostRooms = postRooms
      .filter(r => r && r.postId) // guard against orphaned rooms
      .map(r => ({
        ...r,
        _roomType: 'post',
        name:    r.postId.title || 'Untitled Post Chat',
        hashtag: r.postId.hashtag || '#resell',
      }));

    // Attach a tag so the frontend knows these are global, plus this viewer's
    // access state so the room list can render Open / Request / Pending without
    // a follow-up call per room. joinRequests itself is never sent to
    // non-creators — it would leak who else asked to join.
    const meId = req.user._id.toString();
    const normalisedGlobalRooms = globalRooms
      .filter(Boolean)
      .map(r => {
        const creatorId = r.createdBy?._id ? r.createdBy._id.toString() : null;
        const isCreator = creatorId === meId;
        const myRequest = (r.joinRequests || []).find(
          jr => jr.user && jr.user.toString() === meId
        );

        let myAccess = 'open';
        if (r.requiresApproval) {
          if (isCreator)                    myAccess = 'creator';
          else if (req.user.role === 'Admin') myAccess = 'admin';
          else if (!myRequest)              myAccess = 'none';
          else                              myAccess = myRequest.status;
        }

        const { joinRequests, ...rest } = r;
        return {
          ...rest,
          _roomType: 'global',
          createdBy: r.createdBy || { displayName: 'System' },
          requiresApproval: !!r.requiresApproval,
          myAccess,
          canEnter: !r.requiresApproval || ['creator', 'admin', 'approved'].includes(myAccess),
          // Only the creator (or a site Admin) sees the pending badge count
          pendingCount: (isCreator || req.user.role === 'Admin')
            ? (joinRequests || []).filter(jr => jr.status === 'pending').length
            : undefined,
        };
      });

    return res.json({ success: true, data: [...normalisedGlobalRooms, ...normalisedPostRooms] });
  } catch (err) {
    console.error('[GET /rooms]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch rooms.', error: err.message });
  }
});

// ── GET /api/rooms/hashtags — list allowed hashtag slugs ─────────────────────
router.get('/rooms/hashtags', protect, (_req, res) => {
  return res.json({ success: true, data: ChatRoom.allowedHashtags || [] });
});

// ── POST /api/rooms — create a new global room ───────────────────────────────
router.post('/rooms', protect, async (req, res) => {
  try {
    const { name, hashtag } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Room name is required.' });
    }

    const slug = hashtag?.trim() || ChatRoom.APPROVAL_HASHTAG;

    // Any category may be created. Only #general rooms are approval-gated —
    // there the creator admits members one by one; every other category stays
    // open to all, exactly as before.
    const gated = slug === ChatRoom.APPROVAL_HASHTAG;

    const room = await ChatRoom.create({
      isGlobal:      true,
      name:          name.trim(),
      hashtag:       slug,
      createdBy:     req.user._id,
      isActive:      true,
      lastMessageAt: new Date(),
      requiresApproval: gated,
      participants:     [req.user._id],
    });

    await room.populate('createdBy', 'displayName avatarUrl role');

    // Mirror the shape of GET /rooms so the client can drop this straight into
    // its list — without myAccess/canEnter the creator's own new room would
    // render as if they had no access to it.
    return res.status(201).json({
      success: true,
      data: {
        ...room.toObject(),
        _roomType:        'global',
        requiresApproval: gated,
        myAccess:         gated ? 'creator' : 'open',
        canEnter:         true,
        pendingCount:     0,
      },
    });
  } catch (err) {
    console.error('[POST /rooms]', err);
    return res.status(500).json({ success: false, message: 'Failed to create room.' });
  }
});

// ── POST /api/rooms/from-post/:postId — find or create a global room for a post ──
router.post('/rooms/from-post/:postId', protect, async (req, res) => {
  try {
    const Post = require('../models/Post');
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    // Look for an existing room for this post
    let room = await ChatRoom.findOne({ postId: post._id, isActive: true });
    
    if (!room) {
      room = await ChatRoom.create({
        isGlobal:      true,
        postId:        post._id,
        name:          post.title,
        hashtag:       post.hashtag || '#general',
        createdBy:     post.author,
        isActive:      true,
        lastMessageAt: new Date(),
      });
    }

    return res.status(200).json({ success: true, data: room });
  } catch (err) {
    console.error('[POST /rooms/from-post]', err);
    return res.status(500).json({ success: false, message: 'Failed to find or create room for post.' });
  }
});

// ── DELETE /api/rooms/:id — close a global room ──────────────────────────────
router.delete('/rooms/:id', protect, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id);
    if (!room || !room.isGlobal) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }

    const isCreator = room.createdBy?.toString() === req.user._id.toString();
    if (!isCreator && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only the room creator can close this room.' });
    }

    room.isActive = false;
    await room.save();
    return res.json({ success: true, message: 'Room closed.' });
  } catch (err) {
    console.error('[DELETE /rooms/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to close room.' });
  }
});

// ── GET /api/rooms/:id/messages — fetch last 60 messages ─────────────────────
router.get('/rooms/:id/messages', protect, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id);
    if (!room || !room.isGlobal) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }

    // Approval-gated rooms: only the creator, a site Admin, or an approved
    // member may read history.
    const access = room.canAccess(req.user._id, req.user.role);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: access.reason, status: access.status });
    }

    const messages = await Message.find({ roomId: room._id })
      .sort({ timestamp: -1 })
      .limit(60)
      .populate('senderId', 'displayName avatarUrl role')
      .lean();

    return res.json({ success: true, data: messages.reverse() });
  } catch (err) {
    console.error('[GET /rooms/:id/messages]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// ROOM JOIN REQUESTS  — approval flow for user-created (#general) rooms
//
//   POST  /api/rooms/:id/join-request              – ask to join
//   GET   /api/rooms/:id/join-requests             – creator lists requests
//   PATCH /api/rooms/:id/join-requests/:userId     – creator approves/declines
// ════════════════════════════════════════════════════════════════════════════════

// ── POST /api/rooms/:id/join-request ─────────────────────────────────────────
router.post('/rooms/:id/join-request', protect, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id);
    if (!room || !room.isGlobal || !room.isActive) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }
    if (!room.requiresApproval) {
      return res.status(400).json({ success: false, message: 'This room is open — no request needed.' });
    }
    if (room.isCreator(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You created this room.' });
    }

    const existing = room.findRequest(req.user._id);
    if (existing) {
      // Re-requesting is a no-op; a declined user must be re-invited by the
      // creator rather than being able to spam a fresh request.
      const messages = {
        pending:  'Your request is already awaiting approval.',
        approved: 'You are already a member of this room.',
        declined: 'Your request to join this room was declined.',
      };
      return res.status(409).json({
        success: false,
        message: messages[existing.status],
        status:  existing.status,
      });
    }

    room.joinRequests.push({ user: req.user._id, status: 'pending' });
    await room.save();

    // Notify the room creator so the request surfaces outside the chat page too
    if (room.createdBy) {
      await emitNotifications([{
        recipient: room.createdBy,
        sender:    req.user._id,
        type:      'join_request',
        message:   `${req.user.displayName} asked to join "${room.name}".`,
      }]);
    }

    // Live-push to the creator if they have the hub open
    const io = global._io;
    if (io && room.createdBy) {
      io.to(`user:${room.createdBy.toString()}`).emit('joinRequestReceived', {
        roomId:   room._id.toString(),
        roomName: room.name,
        user: {
          _id:         req.user._id,
          displayName: req.user.displayName,
          avatarUrl:   req.user.avatarUrl || null,
          rollNo:      req.user.rollNo || null,
        },
        requestedAt: new Date(),
      });
    }

    return res.status(201).json({ success: true, status: 'pending', message: 'Request sent to the room creator.' });
  } catch (err) {
    console.error('[POST /rooms/:id/join-request]', err);
    return res.status(500).json({ success: false, message: 'Failed to send join request.' });
  }
});

// ── GET /api/rooms/:id/join-requests ─────────────────────────────────────────
// Creator (or a site Admin) lists requests. ?status=pending to filter.
router.get('/rooms/:id/join-requests', protect, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id)
      .populate('joinRequests.user', 'displayName avatarUrl role rollNo instituteEmail');

    if (!room || !room.isGlobal) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }
    if (!room.isCreator(req.user._id) && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only the room creator can view join requests.' });
    }

    let requests = (room.joinRequests || []).filter(r => r.user);
    if (req.query.status) {
      requests = requests.filter(r => r.status === req.query.status);
    }
    // Newest first
    requests = requests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    return res.json({
      success:      true,
      data:         requests,
      pendingCount: (room.joinRequests || []).filter(r => r.status === 'pending').length,
    });
  } catch (err) {
    console.error('[GET /rooms/:id/join-requests]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch join requests.' });
  }
});

// ── PATCH /api/rooms/:id/join-requests/:userId ───────────────────────────────
// Body: { action: 'approve' | 'decline' }
router.patch('/rooms/:id/join-requests/:userId', protect, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['approve', 'decline'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'decline'." });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room || !room.isGlobal) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }
    if (!room.isCreator(req.user._id) && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only the room creator can decide join requests.' });
    }

    const request = room.findRequest(req.params.userId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'No join request from this user.' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `This request was already ${request.status}.`,
        status:  request.status,
      });
    }

    request.status    = action === 'approve' ? 'approved' : 'declined';
    request.decidedAt = new Date();
    request.decidedBy = req.user._id;

    if (action === 'approve') {
      const already = (room.participants || []).some(
        p => p.toString() === req.params.userId.toString()
      );
      if (!already) room.participants.push(req.params.userId);
    }
    await room.save();

    // Tell the requester what happened
    await emitNotifications([{
      recipient: req.params.userId,
      sender:    req.user._id,
      type:      action === 'approve' ? 'join_approved' : 'join_declined',
      message:   action === 'approve'
        ? `Your request to join "${room.name}" was approved.`
        : `Your request to join "${room.name}" was declined.`,
    }]);

    const io = global._io;
    if (io) {
      io.to(`user:${req.params.userId.toString()}`).emit('joinRequestDecided', {
        roomId:   room._id.toString(),
        roomName: room.name,
        status:   request.status,
      });
      // If they were declined while sitting in the room, evict them.
      if (action === 'decline') {
        io.to(room._id.toString()).emit('roomAccessRevoked', {
          roomId: room._id.toString(),
          userId: req.params.userId.toString(),
        });
      }
    }

    return res.json({ success: true, status: request.status, message: `Request ${request.status}.` });
  } catch (err) {
    console.error('[PATCH /rooms/:id/join-requests/:userId]', err);
    return res.status(500).json({ success: false, message: 'Failed to update join request.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// USER routes  (/api/users/…)
// ════════════════════════════════════════════════════════════════════════════════
// NOTE: /users/me/* routes must be registered BEFORE router.use('/users', userRoutes)
// so that 'me' is not matched as a MongoDB ObjectId by the /:id param.
// ── GET /api/users/search — autocomplete for @mentions ───────────────────────────
// NOTE: must be before router.use('/users', userRoutes) to avoid :id match
router.get('/users/search', protect, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ success: true, data: [] });
    const users = await User.find({
      displayName: { $regex: q, $options: 'i' },
    }).select('_id displayName avatarUrl role').limit(8).lean();
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error('[GET /users/search]', err);
    return res.status(500).json({ success: false, data: [] });
  }
});

// ── GET /api/users?role=Admin — list users filtered by role ──────────────────
router.get('/users', protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const users = await User.find(filter)
      .select('_id displayName avatarUrl rollNo role')
      .limit(limit)
      .lean();
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error('[GET /users]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

router.get('/users/me/saved', protect, interactionController.getSavedPosts);

router.use('/users', userRoutes);

// ════════════════════════════════════════════════════════════════════════════════
// NOTIFICATION routes  (/api/notifications/…)
// ════════════════════════════════════════════════════════════════════════════════
router.get('/notifications',             protect, notificationController.getNotifications);
router.get('/notifications/unread-count',protect, notificationController.getUnreadCount);
router.patch('/notifications/read',      protect, notificationController.markAllRead);

// ════════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENT routes  (/api/announcements/…)
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/announcements — active announcements from followed clubs + own
router.get('/announcements', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select('following role').lean();
    const authorIds = [...(me.following || []), req.user._id];

    const announcements = await Announcement.find({
      isActive:  true,
      expiresAt: { $gt: new Date() },
      author:    { $in: authorIds },
    })
      .populate('author', 'displayName avatarUrl role')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: announcements });
  } catch (err) {
    console.error('[GET /announcements]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch announcements.' });
  }
});

// POST /api/announcements — create (Club/Admin only)
router.post('/announcements', protect, clubOrAdmin, async (req, res) => {
  try {
    const { text, imageUrl, durationHours } = req.body;
    const hours = Math.min(48, Math.max(1, parseInt(durationHours) || 24));

    if (!text?.trim() && !imageUrl?.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement must have text or an image.' });
    }

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const announcement = await Announcement.create({
      author:        req.user._id,
      text:          text?.trim() || '',
      imageUrl:      imageUrl?.trim() || null,
      durationHours: hours,
      expiresAt,
    });
    await announcement.populate('author', 'displayName avatarUrl role');

    // Fire notifications to all followers
    const author = await User.findById(req.user._id).select('followers displayName').lean();
    if (author.followers?.length > 0) {
      const notifs = author.followers.map(followerId => ({
        recipient:    followerId,
        sender:       req.user._id,
        type:         'announcement',
        announcement: announcement._id,
        message:      `${author.displayName} posted a new announcement.`,
      }));
      await Notification.insertMany(notifs);
    }

    return res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    console.error('[POST /announcements]', err);
    return res.status(500).json({ success: false, message: 'Failed to create announcement.' });
  }
});

// DELETE /api/announcements/:id — soft-delete own announcement
router.delete('/announcements/:id', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found.' });
    if (ann.author.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    ann.isActive = false;
    await ann.save();
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /announcements/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete.' });
  }
});

// POST /api/announcements/:id/seen — mark as seen
router.post('/announcements/:id/seen', protect, async (req, res) => {
  try {
    await Announcement.updateOne(
      { _id: req.params.id },
      { $addToSet: { seenBy: req.user._id } }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// LIBRARY routes  (/api/library/…)
//
// All routes sit behind `protect`, i.e. the same JWT the rest of Campus Buzz
// uses — a student already signed in never logs in again for the library.
// ════════════════════════════════════════════════════════════════════════════════

// ── Student ──────────────────────────────────────────────────────────────────
router.get('/library/slots',        protect, libraryController.getSlots);
router.get('/library/bookings/me',  protect, libraryController.getMyBookings);

// Admin listing must be registered before nothing else conflicts, but note
// /library/bookings/me is declared above so it is not shadowed by /:id routes.
router.post('/library/bookings',                protect, libraryController.createBooking);
router.patch('/library/bookings/:id/cancel',    protect, libraryController.cancelBooking);
router.patch('/library/bookings/:id/check-in',  protect, libraryController.checkIn);

// ── Seat holds (30s checkout window) ─────────────────────────────────────────
router.post('/library/holds',   protect, libraryController.holdSeat);
router.delete('/library/holds', protect, libraryController.releaseHold);

// ── Digital library ID (QR) ──────────────────────────────────────────────────
router.get('/library/id-card',   protect, libraryController.getIdCard);
router.post('/library/verify-id', protect, adminOnly, libraryController.verifyIdCard);

// ── Admin: seats ─────────────────────────────────────────────────────────────
// Declared before GET /library/seats so the adminOnly guard is not bypassed by
// method — Express matches on method + path, so both can share the path.
router.post('/library/seats',       protect, adminOnly, libraryController.createSeats);
router.patch('/library/seats/:id',  protect, adminOnly, libraryController.updateSeat);
router.delete('/library/seats/:id', protect, adminOnly, libraryController.deleteSeat);

router.get('/library/seats',        protect, libraryController.getSeats);

// ── Admin: oversight ─────────────────────────────────────────────────────────
router.get('/library/bookings',     protect, adminOnly, libraryController.getAllBookings);
router.get('/library/stats',        protect, adminOnly, libraryController.getStats);

module.exports = router;
