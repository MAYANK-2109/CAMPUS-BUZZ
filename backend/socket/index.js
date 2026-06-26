/**
 * socket/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Socket.io server – real-time chat for post rooms.
 *
 * Room naming convention: each post gets its own room named by its _id string.
 * Users join a room via `joinRoom`, send messages via `sendMessage`.
 *
 * Auth: On connection the client passes the JWT as a handshake query param
 * `?token=<jwt>` or in `auth.token`. The socket middleware verifies it before
 * allowing the connection.
 *
 * Events:
 *   Client → Server:
 *     joinRoom    { postId }
 *     sendMessage { postId, text }
 *     disconnect  (built-in)
 *
 *   Server → Client:
 *     joinedRoom  { roomId, history: Message[] }
 *     newMessage  { _id, roomId, senderId, text, timestamp, senderName }
 *     roomError   { message }
 *     userJoined  { userId, displayName }
 */

const { Server }  = require('socket.io');
const jwt         = require('jsonwebtoken');
const User        = require('../models/User');
const Post        = require('../models/Post');
const ChatRoom    = require('../models/ChatRoom');
const Message     = require('../models/Message');

/**
 * initSocket
 * ──────────
 * Attaches a Socket.io Server to the existing http.Server instance.
 * Called once from server.js.
 *
 * @param {http.Server} httpServer  The Node HTTP server.
 * @returns {Server}                The Socket.io server instance.
 */
const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin:      process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    },
    // Ping timeout / interval – tune for campus network conditions
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // ── Socket Authentication Middleware ────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      // Token can arrive either via handshake.auth or as a query param
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication error: no token provided.'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select('-passwordHash');

      if (!user) {
        return next(new Error('Authentication error: user not found.'));
      }

      // Attach user to the socket for downstream handlers
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: invalid or expired token.'));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(
      `[Socket] Connected: user=${socket.user.displayName} (${socket.user._id}), ` +
      `socketId=${socket.id}`
    );

    // ── joinRoom ──────────────────────────────────────────────────────────────
    socket.on('joinRoom', async ({ postId }) => {
      try {
        if (!postId) {
          return socket.emit('roomError', { message: 'postId is required to join a room.' });
        }

        // Verify the post exists and is active
        const post = await Post.findById(postId);
        if (!post) {
          return socket.emit('roomError', { message: 'Post not found.' });
        }
        if (!post.isActive) {
          return socket.emit('roomError', { message: 'This post has expired.' });
        }

        // Only posts with chat-enabled hashtags can have rooms
        const CHAT_HASHTAGS = new Set(['#foodsplit', '#cabsplit', '#resell']);
        if (!CHAT_HASHTAGS.has(post.hashtag)) {
          return socket.emit('roomError', { message: 'This post type does not support chat.' });
        }

        // Find or create the ChatRoom document
        const room = await ChatRoom.findOrCreate(postId);
        if (!room.isActive) {
          return socket.emit('roomError', { message: 'This chat room is no longer active.' });
        }

        // Add user to participants (using $addToSet to avoid duplicates)
        await ChatRoom.updateOne(
          { _id: room._id },
          { $addToSet: { participants: socket.user._id } }
        );

        // Join the socket.io room (named by postId string)
        socket.join(postId);
        socket.currentRoom = postId; // Track for disconnect cleanup

        // Fetch last 50 messages for the room (sent as history to the joiner only)
        const history = await Message.find({ roomId: room._id })
          .sort({ timestamp: -1 })
          .limit(50)
          .populate('senderId', 'displayName role')
          .lean();

        // Emit history to the connecting user only
        socket.emit('joinedRoom', {
          roomId:  postId,
          history: history.reverse(), // chronological order
        });

        // Notify others in the room
        socket.to(postId).emit('userJoined', {
          userId:      socket.user._id,
          displayName: socket.user.displayName,
        });

        console.log(
          `[Socket] ${socket.user.displayName} joined room ${postId}`
        );
      } catch (err) {
        console.error('[Socket joinRoom error]', err);
        socket.emit('roomError', { message: 'Failed to join room. Please try again.' });
      }
    });

    // ── sendMessage ───────────────────────────────────────────────────────────
    socket.on('sendMessage', async ({ postId, text }) => {
      try {
        if (!postId || !text?.trim()) {
          return socket.emit('roomError', { message: 'postId and text are required.' });
        }

        // Hard cap on message length (mirrors the Mongoose schema)
        if (text.trim().length > 1000) {
          return socket.emit('roomError', { message: 'Message too long (max 1000 characters).' });
        }

        // Retrieve the ChatRoom
        const room = await ChatRoom.findOne({ postId });
        if (!room || !room.isActive) {
          return socket.emit('roomError', { message: 'Chat room is closed or does not exist.' });
        }

        // Verify the post is still active (second guard after cron may have run)
        const post = await Post.findById(postId).select('isActive');
        if (!post?.isActive) {
          return socket.emit('roomError', { message: 'The post for this chat has expired.' });
        }

        // Persist the message
        const message = await Message.create({
          roomId:    room._id,
          senderId:  socket.user._id,
          text:      text.trim(),
          timestamp: new Date(),
        });

        // Build the broadcast payload
        const payload = {
          _id:        message._id,
          roomId:     postId,
          senderId:   socket.user._id,
          senderName: socket.user.displayName,
          senderRole: socket.user.role,
          text:       message.text,
          timestamp:  message.timestamp,
        };

        // Broadcast to ALL users in the room (including sender)
        // This ensures the sender sees their own message via the socket stream
        io.to(postId).emit('newMessage', payload);

        console.log(
          `[Socket] Message from ${socket.user.displayName} in room ${postId}: "${text.trim().slice(0, 40)}"`
        );
      } catch (err) {
        console.error('[Socket sendMessage error]', err);
        socket.emit('roomError', { message: 'Failed to send message. Please try again.' });
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(
        `[Socket] Disconnected: user=${socket.user?.displayName}, ` +
        `reason=${reason}, socketId=${socket.id}`
      );
      // socket.io automatically removes the socket from all rooms on disconnect
      // No explicit room leave is needed here.
    });
  });

  return io;
};

module.exports = { initSocket };
