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

// ════════════════════════════════════════════════════════════════════════════════
// AUTH routes  (/api/auth/…)  — registration and login are public
// ════════════════════════════════════════════════════════════════════════════════
router.post('/auth/register', authController.register);
router.post('/auth/login',    authController.login);
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
router.patch('/events/:id/status',   protect, adminOnly,  eventController.updateEventStatus);
router.delete('/events/:id',         protect, adminOnly,  eventController.deleteEvent);

// ════════════════════════════════════════════════════════════════════════════════
// COMPLAINT routes  (/api/complaints/…)
// ════════════════════════════════════════════════════════════════════════════════
/**
 * GET  /api/complaints      – Students receive list WITHOUT author (anonymised).
 *                             Admins receive list WITH populated author.
 * POST /api/complaints      – any authenticated user
 * PATCH /api/complaints/:id – Admin only: update status (Open / Resolved)
 */
router.get('/complaints',       protect,            complaintController.getComplaints);
router.post('/complaints',      protect,            complaintController.createComplaint);
router.patch('/complaints/:id', protect, adminOnly, complaintController.updateComplaintStatus);

// ════════════════════════════════════════════════════════════════════════════════
// CLUBS route  (/api/clubs)  – list all Club/Admin accounts for search & follow
// ════════════════════════════════════════════════════════════════════════════════
const User = require('../models/User');
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
// CHAT ROOM routes  (/api/chat-rooms/…)
// ════════════════════════════════════════════════════════════════════════════════
/**
 * PATCH /api/chat-rooms/:postId/close
 *   Closes the chat room for a post. Only the post author or an Admin can call this.
 *   The room is deactivated (isActive = false); the post itself is NOT deleted.
 */
const ChatRoom = require('../models/ChatRoom');
router.patch('/chat-rooms/:postId/close', protect, async (req, res) => {
  try {
    const Post = require('../models/Post');
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const isAuthor = post.author.toString() === req.user._id.toString();
    if (!isAuthor && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only the post author can close this room.' });
    }

    const room = await ChatRoom.findOne({ postId: req.params.postId });
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat room not found.' });
    }
    if (!room.isActive) {
      return res.status(400).json({ success: false, message: 'Room is already closed.' });
    }

    room.isActive = false;
    await room.save();

    return res.status(200).json({ success: true, message: 'Chat room closed.' });
  } catch (err) {
    console.error('[chat-rooms/close]', err);
    return res.status(500).json({ success: false, message: 'Failed to close chat room.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// USER routes  (/api/users/…)
// ════════════════════════════════════════════════════════════════════════════════
// NOTE: /users/me/* routes must be registered BEFORE router.use('/users', userRoutes)
// so that 'me' is not matched as a MongoDB ObjectId by the /:id param.
router.get('/users/me/saved', protect, interactionController.getSavedPosts);

router.use('/users', userRoutes);

// ════════════════════════════════════════════════════════════════════════════════
// NOTIFICATION routes  (/api/notifications/…)
// ════════════════════════════════════════════════════════════════════════════════
router.get('/notifications',             protect, notificationController.getNotifications);
router.get('/notifications/unread-count',protect, notificationController.getUnreadCount);
router.patch('/notifications/read',      protect, notificationController.markAllRead);

module.exports = router;
