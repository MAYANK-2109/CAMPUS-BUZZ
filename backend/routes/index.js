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

    // Attach a tag so the frontend knows these are global
    const normalisedGlobalRooms = globalRooms
      .filter(Boolean)
      .map(r => ({
        ...r,
        _roomType: 'global',
        createdBy: r.createdBy || { displayName: 'System' }
      }));

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
    const slug = hashtag?.trim() || '#general';

    const room = await ChatRoom.create({
      isGlobal:      true,
      name:          name.trim(),
      hashtag:       slug,
      createdBy:     req.user._id,
      isActive:      true,
      lastMessageAt: new Date(),
    });

    await room.populate('createdBy', 'displayName avatarUrl role');
    return res.status(201).json({ success: true, data: room });
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

module.exports = router;
