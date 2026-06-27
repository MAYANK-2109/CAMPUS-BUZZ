/**
 * routes/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central router that mounts all API sub-routes.
 * All routes are protected by the `protect` middleware (JWT verification).
 * Role-specific routes apply additional RBAC guards.
 *
 * Mount point: /api  (set in server.js)
 *
 * Route map:
 *   POST   /api/auth/register
 *   POST   /api/auth/login
 *   POST   /api/auth/forgot-password
 *   PATCH  /api/auth/reset-password/:token
 *   GET    /api/auth/me
 *
 *   GET    /api/posts
 *   POST   /api/posts
 *   GET    /api/posts/trending-hashtags
 *   GET    /api/posts/:id
 *   PATCH  /api/posts/:id
 *   DELETE /api/posts/:id
 *   POST   /api/posts/:id/like
 *   POST   /api/posts/:id/dislike
 *   POST   /api/posts/:id/save
 *   GET    /api/posts/:id/comments
 *   POST   /api/posts/:id/comments
 *   POST   /api/posts/:id/report
 *
 *   GET    /api/events
 *   POST   /api/events
 *   POST   /api/events/request
 *   PATCH  /api/events/:id/status
 *   POST   /api/events/:id/rsvp
 *   DELETE /api/events/:id
 *
 *   GET    /api/complaints
 *   GET    /api/complaints/mine
 *   GET    /api/complaints/search
 *   POST   /api/complaints
 *   POST   /api/complaints/:id/upvote
 *   PATCH  /api/complaints/:id/edit
 *   PATCH  /api/complaints/:id
 *
 *   GET    /api/clubs
 *   GET    /api/users/search
 *   GET    /api/users
 *   GET    /api/users/me/saved
 *   POST   /api/users/:id/follow
 *   GET    /api/users/:id  (via userRoutes)
 *   PATCH  /api/users/profile  (via userRoutes)
 *
 *   GET    /api/rooms
 *   GET    /api/rooms/hashtags
 *   POST   /api/rooms
 *   POST   /api/rooms/from-post/:postId
 *   DELETE /api/rooms/:id
 *   GET    /api/rooms/:id/messages
 *   PATCH  /api/chat-rooms/:postId/close
 *
 *   GET    /api/notifications
 *   GET    /api/notifications/unread-count
 *   PATCH  /api/notifications/read
 *
 *   GET    /api/announcements
 *   POST   /api/announcements
 *   DELETE /api/announcements/:id
 *   POST   /api/announcements/:id/seen
 */

const router = require('express').Router();

// ── Middleware ────────────────────────────────────────────────────────────────
const { protect }                             = require('../middleware/auth');
const { adminOnly, clubOrAdmin }              = require('../middleware/rbac');

// ── Controllers ───────────────────────────────────────────────────────────────
const authController          = require('../controllers/authController');
const postController          = require('../controllers/postController');
const eventController         = require('../controllers/eventController');
const complaintController     = require('../controllers/complaintController');
const interactionController   = require('../controllers/interactionController');
const notificationController  = require('../controllers/notificationController');
const roomController          = require('../controllers/roomController');
const announcementController  = require('../controllers/announcementController');
const userController          = require('../controllers/userController');

// ── Sub-routers ───────────────────────────────────────────────────────────────
const userRoutes = require('./userRoutes');

// ════════════════════════════════════════════════════════════════════════════════
// AUTH  (/api/auth/…)
// ════════════════════════════════════════════════════════════════════════════════
router.post('/auth/register',                  authController.register);
router.post('/auth/login',                     authController.login);
router.post('/auth/forgot-password',           authController.forgotPassword);
router.patch('/auth/reset-password/:token',    authController.resetPassword);
router.get( '/auth/me',           protect,     authController.getMe);

// ════════════════════════════════════════════════════════════════════════════════
// POSTS  (/api/posts/…)
// NOTE: static sub-paths (trending-hashtags) MUST come before /:id to avoid
//       Express treating the word as an ObjectId.
// ════════════════════════════════════════════════════════════════════════════════
router.get('/posts',                    protect, postController.getPosts);
router.post('/posts',                   protect, postController.createPost);
router.get('/posts/trending-hashtags',  protect, postController.getTrendingHashtags);
router.get('/posts/:id',                protect, postController.getPostById);
router.patch('/posts/:id',              protect, postController.updatePost);
router.delete('/posts/:id',             protect, postController.deletePost);

// Post interactions
router.post('/posts/:id/like',          protect, interactionController.toggleLike);
router.post('/posts/:id/dislike',       protect, interactionController.toggleDislike);
router.post('/posts/:id/save',          protect, interactionController.toggleSavePost);
router.get('/posts/:id/comments',       protect, interactionController.getComments);
router.post('/posts/:id/comments',      protect, interactionController.addComment);
router.post('/posts/:id/report',        protect, postController.reportPost);

// ════════════════════════════════════════════════════════════════════════════════
// EVENTS  (/api/events/…)
// ════════════════════════════════════════════════════════════════════════════════
router.get('/events',                   protect,             eventController.getEvents);
router.post('/events',                  protect,             eventController.createEvent);
router.post('/events/request',          protect,             eventController.requestEvent);
router.patch('/events/:id/status',      protect, adminOnly,  eventController.updateEventStatus);
router.post('/events/:id/rsvp',         protect,             eventController.toggleRsvp);
router.delete('/events/:id',            protect, adminOnly,  eventController.deleteEvent);

// ════════════════════════════════════════════════════════════════════════════════
// COMPLAINTS  (/api/complaints/…)
// ════════════════════════════════════════════════════════════════════════════════
router.get('/complaints/mine',          protect,            complaintController.getMyComplaintIds);
router.get('/complaints/search',        protect,            complaintController.searchComplaints);
router.get('/complaints',               protect,            complaintController.getComplaints);
router.post('/complaints',              protect,            complaintController.createComplaint);
router.post('/complaints/:id/upvote',   protect,            complaintController.upvoteComplaint);
router.patch('/complaints/:id/edit',    protect,            complaintController.editComplaint);
router.patch('/complaints/:id',         protect,            complaintController.updateComplaintStatus);

// ════════════════════════════════════════════════════════════════════════════════
// USERS  (/api/users/…  and  /api/clubs)
// NOTE: static paths (search, me) MUST be registered before router.use('/users')
//       to prevent 'search' being matched as an ObjectId.
// ════════════════════════════════════════════════════════════════════════════════
router.get('/clubs',                    protect, userController.getClubs);
router.get('/users/search',             protect, userController.searchUsers);
router.get('/users',                    protect, userController.listUsers);
router.get('/users/me/saved',           protect, interactionController.getSavedPosts);
router.post('/users/:id/follow',        protect, interactionController.followClub);
router.use('/users',                    userRoutes);

// ════════════════════════════════════════════════════════════════════════════════
// CHAT ROOMS  (/api/rooms/…  and  /api/chat-rooms/…)
// NOTE: static sub-paths (hashtags, from-post) MUST come before /:id.
// ════════════════════════════════════════════════════════════════════════════════
router.get('/rooms',                          protect, roomController.getRooms);
router.get('/rooms/hashtags',                 protect, roomController.getHashtags);
router.post('/rooms',                         protect, roomController.createRoom);
router.post('/rooms/from-post/:postId',       protect, roomController.findOrCreateFromPost);
router.delete('/rooms/:id',                   protect, roomController.closeRoom);
router.get('/rooms/:id/messages',             protect, roomController.getRoomMessages);
router.patch('/chat-rooms/:postId/close',     protect, roomController.closePostRoom);

// ════════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS  (/api/notifications/…)
// ════════════════════════════════════════════════════════════════════════════════
router.get('/notifications',              protect, notificationController.getNotifications);
router.get('/notifications/unread-count', protect, notificationController.getUnreadCount);
router.patch('/notifications/read',       protect, notificationController.markAllRead);

// ════════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS  (/api/announcements/…)
// ════════════════════════════════════════════════════════════════════════════════
router.get('/announcements',              protect,              announcementController.getAnnouncements);
router.post('/announcements',             protect, clubOrAdmin,  announcementController.createAnnouncement);
router.delete('/announcements/:id',       protect,              announcementController.deleteAnnouncement);
router.post('/announcements/:id/seen',    protect,              announcementController.markSeen);

module.exports = router;
