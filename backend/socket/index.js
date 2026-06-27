/**
 * socket/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Socket.io server — handles BOTH:
 *   1. Post-linked rooms (foodsplit, cabsplit, resell) — unchanged
 *   2. Global chat hub rooms — new
 *
 * Global room events (Client → Server):
 *   joinGlobalRoom   { roomId }
 *   sendGlobalMsg    { roomId, text }
 *   leaveGlobalRoom  { roomId }
 *   closeGlobalRoom  { roomId }
 *
 * Global room events (Server → Client):
 *   globalJoined     { roomId, history, room }
 *   globalMessage    { _id, roomId, senderId, senderName, senderAvatar, senderRole, text, timestamp }
 *   globalRoomClosed { roomId, closedBy }
 *   roomsUpdated     (broadcast — triggers clients to re-fetch room list)
 */

const { Server }  = require('socket.io');
const jwt         = require('jsonwebtoken');
const User        = require('../models/User');
const Post        = require('../models/Post');
const ChatRoom    = require('../models/ChatRoom');
const Message     = require('../models/Message');

const initSocket = (httpServer) => {
  // Mirror the allowed origins from the server CORS config.
  // CLIENT_URL can be comma-separated (e.g. "https://campus-buzz.onrender.com,http://localhost:3000")
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production' && !allowedOrigins.includes('http://localhost:3000')) {
    allowedOrigins.push('http://localhost:3000');
  }

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: socket origin "${origin}" not allowed.`));
      },
      credentials: true,
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // ── Socket Authentication Middleware ────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) return next(new Error('Authentication error: no token provided.'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select('-passwordHash');
      if (!user)    return next(new Error('Authentication error: user not found.'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: invalid or expired token.'));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.user.displayName} (${socket.user._id}) socketId=${socket.id}`);

    // ═══════════════════════════════════════════════════════════════════════════
    //  POST-LINKED ROOM EVENTS  (existing — unchanged)
    // ═══════════════════════════════════════════════════════════════════════════

    // ── joinRoom ──────────────────────────────────────────────────────────────
    socket.on('joinRoom', async ({ postId }) => {
      try {
        if (!postId) return socket.emit('roomError', { message: 'postId is required to join a room.' });

        const post = await Post.findById(postId);
        if (!post)          return socket.emit('roomError', { message: 'Post not found.' });
        if (!post.isActive) return socket.emit('roomError', { message: 'This post has expired.' });

        const CHAT_HASHTAGS = new Set(['#foodsplit', '#cabsplit', '#resell']);
        if (!CHAT_HASHTAGS.has(post.hashtag)) {
          return socket.emit('roomError', { message: 'This post type does not support chat.' });
        }

        const room = await ChatRoom.findOrCreate(postId);
        if (!room.isActive) return socket.emit('roomError', { message: 'This chat room is no longer active.' });

        await ChatRoom.updateOne(
          { _id: room._id },
          { $addToSet: { participants: socket.user._id } }
        );

        socket.join(postId);
        socket.currentRoom = postId;

        const history = await Message.find({ roomId: room._id })
          .sort({ timestamp: -1 })
          .limit(50)
          .populate('senderId', 'displayName role')
          .lean();

        socket.emit('joinedRoom', { roomId: postId, history: history.reverse() });
        socket.to(postId).emit('userJoined', { userId: socket.user._id, displayName: socket.user.displayName });

        console.log(`[Socket] ${socket.user.displayName} joined post-room ${postId}`);
      } catch (err) {
        console.error('[Socket joinRoom error]', err);
        socket.emit('roomError', { message: 'Failed to join room.' });
      }
    });

    // ── sendMessage ───────────────────────────────────────────────────────────
    socket.on('sendMessage', async ({ postId, text }) => {
      try {
        if (!postId || !text?.trim()) return socket.emit('roomError', { message: 'postId and text are required.' });
        if (text.trim().length > 1000)  return socket.emit('roomError', { message: 'Message too long (max 1000 characters).' });

        const room = await ChatRoom.findOne({ postId });
        if (!room || !room.isActive) return socket.emit('roomError', { message: 'Chat room is closed.' });

        const post = await Post.findById(postId).select('isActive');
        if (!post?.isActive) return socket.emit('roomError', { message: 'The post for this chat has expired.' });

        const message = await Message.create({
          roomId:    room._id,
          senderId:  socket.user._id,
          text:      text.trim(),
          timestamp: new Date(),
        });

        const payload = {
          _id:        message._id,
          roomId:     postId,
          senderId:   socket.user._id,
          senderName: socket.user.displayName,
          senderRole: socket.user.role,
          text:       message.text,
          timestamp:  message.timestamp,
        };

        io.to(postId).emit('newMessage', payload);
        console.log(`[Socket] Message from ${socket.user.displayName} in post-room ${postId}`);
      } catch (err) {
        console.error('[Socket sendMessage error]', err);
        socket.emit('roomError', { message: 'Failed to send message.' });
      }
    });

    // ── closeRoom (post-linked) ───────────────────────────────────────────────
    socket.on('closeRoom', async ({ postId }) => {
      try {
        if (!postId) return socket.emit('roomError', { message: 'postId is required.' });

        const post = await Post.findById(postId).populate('author', '_id');
        if (!post) return socket.emit('roomError', { message: 'Post not found.' });

        if (post.author._id.toString() !== socket.user._id.toString()) {
          return socket.emit('roomError', { message: 'Only the post author can close this room.' });
        }

        const room = await ChatRoom.findOne({ postId });
        if (!room)          return socket.emit('roomError', { message: 'Chat room not found.' });
        if (!room.isActive) return socket.emit('roomError', { message: 'Room is already closed.' });

        room.isActive = false;
        await room.save();

        io.to(postId).emit('roomClosed', { postId, closedBy: socket.user.displayName, message: `Room closed by ${socket.user.displayName}.` });
        console.log(`[Socket] Post-room ${postId} closed by ${socket.user.displayName}`);
      } catch (err) {
        console.error('[Socket closeRoom error]', err);
        socket.emit('roomError', { message: 'Failed to close room.' });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    //  GLOBAL HUB ROOM EVENTS  (new)
    // ═══════════════════════════════════════════════════════════════════════════

    // ── joinGlobalRoom ────────────────────────────────────────────────────────
    socket.on('joinGlobalRoom', async ({ roomId }) => {
      try {
        if (!roomId) return socket.emit('roomError', { message: 'roomId is required.' });

        const room = await ChatRoom.findById(roomId)
          .populate('createdBy', 'displayName avatarUrl role');

        if (!room || !room.isGlobal) return socket.emit('roomError', { message: 'Room not found.' });
        if (!room.isActive)          return socket.emit('roomError', { message: 'This room is closed.' });

        await ChatRoom.updateOne(
          { _id: room._id },
          { $addToSet: { participants: socket.user._id } }
        );

        // Track current global room on socket for cleanup
        if (socket.currentGlobalRoom && socket.currentGlobalRoom !== roomId) {
          socket.leave(socket.currentGlobalRoom);
        }
        socket.join(roomId);
        socket.currentGlobalRoom = roomId;

        // Fetch history
        const history = await Message.find({ roomId: room._id })
          .sort({ timestamp: -1 })
          .limit(60)
          .populate('senderId', 'displayName avatarUrl role')
          .lean();

        // Count online members in this io room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        const onlineCount   = socketsInRoom.length;

        socket.emit('globalJoined', {
          roomId,
          room:       room.toObject(),
          history:    history.reverse(),
          onlineCount,
        });

        // Notify others & broadcast updated online users list
        socket.to(roomId).emit('globalUserJoined', {
          userId:      socket.user._id,
          displayName: socket.user.displayName,
        });

        // Build & broadcast the live online-users list for this room
        const broadcastOnlineUsers = async () => {
          const sockets = await io.in(roomId).fetchSockets();
          const users = sockets.map(s => ({
            _id:         s.user._id,
            displayName: s.user.displayName,
            avatarUrl:   s.user.avatarUrl || null,
            role:        s.user.role,
          }));
          io.to(roomId).emit('onlineUsersUpdate', { roomId, users });
        };
        await broadcastOnlineUsers();

        console.log(`[Socket] ${socket.user.displayName} joined global room "${room.name}" (${roomId})`);
      } catch (err) {
        console.error('[Socket joinGlobalRoom error]', err);
        socket.emit('roomError', { message: 'Failed to join room.' });
      }
    });

    // ── sendGlobalMsg ─────────────────────────────────────────────────────────
    socket.on('sendGlobalMsg', async ({ roomId, text }) => {
      try {
        if (!roomId || !text?.trim()) return socket.emit('roomError', { message: 'roomId and text are required.' });
        if (text.trim().length > 1000) return socket.emit('roomError', { message: 'Message too long (max 1000 characters).' });

        const room = await ChatRoom.findById(roomId);
        if (!room || !room.isGlobal || !room.isActive) {
          return socket.emit('roomError', { message: 'Room is closed or not found.' });
        }

        const message = await Message.create({
          roomId:    room._id,
          senderId:  socket.user._id,
          text:      text.trim(),
          timestamp: new Date(),
        });

        // Update lastMessageAt for 2hr inactivity tracking
        await ChatRoom.updateOne({ _id: room._id }, { lastMessageAt: message.timestamp });

        const payload = {
          _id:          message._id,
          roomId,
          senderId:     socket.user._id,
          senderName:   socket.user.displayName,
          senderAvatar: socket.user.avatarUrl || null,
          senderRole:   socket.user.role,
          text:         message.text,
          timestamp:    message.timestamp,
        };

        io.to(roomId).emit('globalMessage', payload);
        console.log(`[Socket] Global msg from ${socket.user.displayName} in "${room.name}": "${text.trim().slice(0, 40)}"`);
      } catch (err) {
        console.error('[Socket sendGlobalMsg error]', err);
        socket.emit('roomError', { message: 'Failed to send message.' });
      }
    });

    // ── leaveGlobalRoom ───────────────────────────────────────────────────────
    socket.on('leaveGlobalRoom', async ({ roomId }) => {
      if (roomId) {
        socket.leave(roomId);
        if (socket.currentGlobalRoom === roomId) socket.currentGlobalRoom = null;
        socket.to(roomId).emit('globalUserLeft', {
          userId:      socket.user._id,
          displayName: socket.user.displayName,
        });
        // Broadcast updated online list after leave
        const sockets = await io.in(roomId).fetchSockets();
        const users = sockets.map(s => ({
          _id:         s.user._id,
          displayName: s.user.displayName,
          avatarUrl:   s.user.avatarUrl || null,
          role:        s.user.role,
        }));
        io.to(roomId).emit('onlineUsersUpdate', { roomId, users });
      }
    });

    // ── cabLocation — relay live GPS from driver to all room members ──────────
    socket.on('cabLocation', ({ postId, lat, lng }) => {
      if (!postId || lat == null || lng == null) return;
      // Broadcast to everyone else in the post room (not the sender)
      socket.to(postId).emit('cabLocationUpdate', {
        postId,
        lat,
        lng,
        sharedBy: socket.user.displayName,
        ts: Date.now(),
      });
    });

    // ── closeGlobalRoom ───────────────────────────────────────────────────────
    socket.on('closeGlobalRoom', async ({ roomId }) => {
      try {
        if (!roomId) return socket.emit('roomError', { message: 'roomId is required.' });

        const room = await ChatRoom.findById(roomId);
        if (!room || !room.isGlobal) return socket.emit('roomError', { message: 'Room not found.' });
        if (!room.isActive)          return socket.emit('roomError', { message: 'Room is already closed.' });

        const isCreator = room.createdBy?.toString() === socket.user._id.toString();
        if (!isCreator && socket.user.role !== 'Admin') {
          return socket.emit('roomError', { message: 'Only the room creator can close this room.' });
        }

        room.isActive = false;
        await room.save();

        // Notify all members in the room
        io.to(roomId).emit('globalRoomClosed', {
          roomId,
          closedBy: socket.user.displayName,
        });

        // Broadcast to everyone that room list has changed
        io.emit('roomsUpdated');

        console.log(`[Socket] Global room "${room.name}" (${roomId}) closed by ${socket.user.displayName}`);
      } catch (err) {
        console.error('[Socket closeGlobalRoom error]', err);
        socket.emit('roomError', { message: 'Failed to close room.' });
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: user=${socket.user?.displayName}, reason=${reason}, socketId=${socket.id}`);
    });
  });

  // Store io instance globally so controllers can emit without circular imports
  global._io = io;

  return io;
};

/**
 * emitNotifications
 * ─────────────────
 * Creates notifications in the DB and immediately pushes a real-time
 * `newNotification` event to each recipient via their personal socket room.
 *
 * Usage (in any controller):
 *   const { emitNotifications } = require('../socket');
 *   await emitNotifications([{ recipient, sender, type, post, message }]);
 *
 * @param {object[]} notifDocs  Array of notification document fields.
 * @returns {Promise<object[]>} The inserted notification documents.
 */
const emitNotifications = async (notifDocs) => {
  if (!notifDocs || notifDocs.length === 0) return [];
  const Notification = require('../models/Notification');
  const inserted = await Notification.insertMany(notifDocs);

  const io = global._io;
  if (io) {
    inserted.forEach((n) => {
      // Each authenticated user joins a personal room keyed by their userId
      io.to(`user:${n.recipient.toString()}`).emit('newNotification', {
        _id:       n._id,
        type:      n.type,
        message:   n.message,
        createdAt: n.createdAt,
        read:      false,
      });
    });
  }

  return inserted;
};

module.exports = { initSocket, emitNotifications };
