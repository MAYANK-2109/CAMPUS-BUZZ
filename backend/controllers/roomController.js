/**
 * controllers/roomController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all HTTP routes for chat rooms:
 *   GET    /api/rooms                  – list all active rooms (global + post-linked)
 *   GET    /api/rooms/hashtags         – list allowed hashtag slugs
 *   POST   /api/rooms                  – create a new global room
 *   POST   /api/rooms/from-post/:id    – find-or-create a post-linked room
 *   DELETE /api/rooms/:id              – close a global room (creator or Admin)
 *   GET    /api/rooms/:id/messages     – fetch last 60 messages for a room
 *   PATCH  /api/chat-rooms/:id/close   – close a post-linked room (author or Admin)
 */

const ChatRoom = require('../models/ChatRoom');
const Message  = require('../models/Message');
const Post     = require('../models/Post');

// ── GET /api/rooms ─────────────────────────────────────────────────────────────
exports.getRooms = async (req, res) => {
  try {
    // 1. Global hub rooms
    const globalRooms = await ChatRoom.find({ isGlobal: true, isActive: true })
      .populate('createdBy', 'displayName avatarUrl role')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();

    // 2. Post-linked chat rooms
    const postRooms = await ChatRoom.find({ isGlobal: false, isActive: true, postId: { $ne: null } })
      .populate('createdBy', 'displayName avatarUrl role')
      .populate('postId', 'title hashtag author')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();

    // Normalise post-linked rooms
    const normalisedPostRooms = postRooms
      .filter(r => r && r.postId)
      .map(r => ({
        ...r,
        _roomType: 'post',
        name:    r.postId.title || 'Untitled Post Chat',
        hashtag: r.postId.hashtag || '#resell',
      }));

    // Attach a type tag to global rooms
    const normalisedGlobalRooms = globalRooms
      .filter(Boolean)
      .map(r => ({
        ...r,
        _roomType: 'global',
        createdBy: r.createdBy || { displayName: 'System' },
      }));

    return res.json({ success: true, data: [...normalisedGlobalRooms, ...normalisedPostRooms] });
  } catch (err) {
    console.error('[GET /rooms]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch rooms.', error: err.message });
  }
};

// ── GET /api/rooms/hashtags ────────────────────────────────────────────────────
exports.getHashtags = (_req, res) => {
  return res.json({ success: true, data: ChatRoom.allowedHashtags || [] });
};

// ── POST /api/rooms ────────────────────────────────────────────────────────────
exports.createRoom = async (req, res) => {
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
};

// ── POST /api/rooms/from-post/:postId ──────────────────────────────────────────
exports.findOrCreateFromPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    let room = await ChatRoom.findOne({ postId: post._id, isActive: true });

    if (!room) {
      room = await ChatRoom.create({
        isGlobal:      false,
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
};

// ── DELETE /api/rooms/:id ──────────────────────────────────────────────────────
exports.closeRoom = async (req, res) => {
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
};

// ── GET /api/rooms/:id/messages ───────────────────────────────────────────────
// Supports cursor pagination: ?before=<msgId>&limit=<N> (default 40)
exports.getRoomMessages = async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }

    const limit  = Math.min(100, parseInt(req.query.limit) || 40);
    const before = req.query.before; // ObjectId of oldest visible message

    const filter = { roomId: room._id };
    if (before) {
      filter._id = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ _id: -1 })          // newest first so the $lt cursor works
      .limit(limit)
      .populate('senderId', 'displayName avatarUrl role')
      .lean();

    // Return in chronological order (oldest → newest)
    const ordered = messages.reverse();

    return res.json({
      success: true,
      data:    ordered,
      hasMore: messages.length === limit, // if we got a full page, there may be more
    });
  } catch (err) {
    console.error('[GET /rooms/:id/messages]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
};

// ── PATCH /api/chat-rooms/:postId/close ───────────────────────────────────────
// Close a post-linked room via REST (author or Admin). Used by "Mark as Sold"
// button on #resell posts and the close button on #foodsplit/#cabsplit posts.
exports.closePostRoom = async (req, res) => {
  try {
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
    console.error('[PATCH /chat-rooms/close]', err);
    return res.status(500).json({ success: false, message: 'Failed to close chat room.' });
  }
};
