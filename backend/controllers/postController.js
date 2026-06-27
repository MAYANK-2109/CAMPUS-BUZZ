/**
 * controllers/postController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD operations for Posts.
 *
 * GET    /api/posts           → paginated active feed (all roles)
 * POST   /api/posts           → create post (all roles; Club/Admin for club-feed)
 * GET    /api/posts/:id       → single post
 * PATCH  /api/posts/:id       → update own post (author) or any post (Admin)
 * DELETE /api/posts/:id       → soft-delete (Admin) or own post (author)
 *
 * Club feed vs Student feed is differentiated by query param ?feed=club
 * Only Club/Admin posts show on the club feed. The RBAC check for *creating*
 * club posts is enforced via the requireRole middleware on the route.
 */

const Post         = require('../models/Post');
const User         = require('../models/User');
const Notification = require('../models/Notification');

// ── Allowed time-sensitive hashtags that need an expiresAt ───────────────────
const TIMED_HASHTAGS = new Set(['#foodsplit', '#cabsplit']);

// ── GET /api/posts ────────────────────────────────────────────────────────────
exports.getPosts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { isActive: true };

    // Hashtag filter
    if (req.query.hashtag && req.query.hashtag !== 'all') {
      filter.hashtag = req.query.hashtag;
    }

    // Club feed: only posts by Club or Admin accounts
    if (req.query.feed === 'club') {
      const User = require('../models/User');
      const clubUsers = await User.find({ role: { $in: ['Club', 'Admin'] } }).select('_id');
      filter.author = { $in: clubUsers.map((u) => u._id) };
    }

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author',   'displayName role instituteEmail rollNo avatarUrl')
        .populate('mentions', 'displayName _id'),
      Post.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data:    posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[postController.getPosts]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch posts.' });
  }
};

// ── POST /api/posts ───────────────────────────────────────────────────────────
exports.createPost = async (req, res) => {
  try {
    const { title, description, imageUrl, hashtag, expiresAt, customTags } = req.body;

    // expiresAt is required for time-sensitive hashtags
    if (TIMED_HASHTAGS.has(hashtag)) {
      if (!expiresAt) {
        return res.status(400).json({
          success: false,
          message: `expiresAt is required for ${hashtag} posts.`,
        });
      }
      const expiry = new Date(expiresAt);
      if (expiry <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'expiresAt must be a future date.',
        });
      }
    }

    // ── Parse @mentions from description ─────────────────────────────────────
    const mentionHandles = [];
    if (description) {
      const raw = description.match(/@([\w\s.]+?)(?=\s|$|[,!?.])/g) || [];
      raw.forEach(m => mentionHandles.push(m.slice(1).trim()));
    }

    // Resolve @mention handles → user IDs by displayName (case-insensitive)
    let mentionIds = [];
    if (mentionHandles.length > 0) {
      const mentionedUsers = await User.find({
        displayName: { $in: mentionHandles.map(h => new RegExp(`^${h}$`, 'i')) },
      }).select('_id');
      mentionIds = mentionedUsers.map(u => u._id);
    }

    const post = await Post.create({
      title,
      description,
      imageUrl:   imageUrl || null,
      author:     req.user._id,
      hashtag:    hashtag || 'None',
      customTags: Array.isArray(customTags) ? customTags : [],
      expiresAt:  TIMED_HASHTAGS.has(hashtag) ? new Date(expiresAt) : null,
      mentions:   mentionIds,
    });

    // ── Fire mention notifications ────────────────────────────────────────────
    if (mentionIds.length > 0) {
      const notifs = mentionIds
        .filter(id => id.toString() !== req.user._id.toString()) // don't notify self
        .map(id => ({
          recipient: id,
          sender:    req.user._id,
          type:      'mention',
          post:      post._id,
          message:   `${req.user.displayName} mentioned you in a post.`,
        }));
      if (notifs.length > 0) await Notification.insertMany(notifs);
    }

    // Populate author + mentions for the response
    await post.populate('author',   'displayName role instituteEmail rollNo avatarUrl');
    await post.populate('mentions', 'displayName _id');

    return res.status(201).json({ success: true, data: post });
  } catch (err) {
    console.error('[postController.createPost]', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(422).json({ success: false, message: messages.join(' ') });
    }
    return res.status(500).json({ success: false, message: 'Failed to create post.' });
  }
};

// ── GET /api/posts/:id ────────────────────────────────────────────────────────
exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author',   'displayName role instituteEmail rollNo avatarUrl')
      .populate('mentions', 'displayName _id');

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    return res.status(200).json({ success: true, data: post });
  } catch (err) {
    console.error('[postController.getPostById]', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid post ID.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to fetch post.' });
  }
};

// ── PATCH /api/posts/:id ──────────────────────────────────────────────────────
exports.updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Only author or Admin can update
    const isAuthor = post.author.toString() === req.user._id.toString();
    if (!isAuthor && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Not authorised to update this post.' });
    }

    const allowedFields = ['title', 'description', 'imageUrl', 'hashtag', 'expiresAt', 'customTags'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        post[field] = req.body[field];
      }
    });

    await post.save();
    await post.populate('author', 'displayName role instituteEmail rollNo');

    return res.status(200).json({ success: true, data: post });
  } catch (err) {
    console.error('[postController.updatePost]', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(422).json({ success: false, message: messages.join(' ') });
    }
    return res.status(500).json({ success: false, message: 'Failed to update post.' });
  }
};

// ── DELETE /api/posts/:id  (soft-delete) ──────────────────────────────────────
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const isAuthor = post.author.toString() === req.user._id.toString();
    if (!isAuthor && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Not authorised to delete this post.' });
    }

    // Soft-delete: preserves chat history
    post.isActive = false;
    await post.save();

    return res.status(200).json({ success: true, message: 'Post deactivated.' });
  } catch (err) {
    console.error('[postController.deletePost]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete post.' });
  }
};
