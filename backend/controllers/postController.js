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

// ── Feed-ranking constants (tunable via env or query params) ──────────────────
const DEFAULT_G = 0.8;   // gravity   – higher = popularity wins more
const DEFAULT_H = 12;    // half-life – hours after which time-boost halves

// ── GET /api/posts ────────────────────────────────────────────────────────────
exports.getPosts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    // Allow callers to request raw-chronological order (?sort=new)
    const sortMode = req.query.sort || 'ranked';

    // Tuning knobs (accept optional overrides from query string for A/B testing)
    const G = parseFloat(req.query.g) || DEFAULT_G;
    const H = parseFloat(req.query.h) || DEFAULT_H;

    const matchStage = { isActive: true };

    // Hashtag filter
    if (req.query.hashtag && req.query.hashtag !== 'all') {
      matchStage.hashtag = req.query.hashtag;
    }

    // Club feed: only posts by Club or Admin accounts
    if (req.query.feed === 'club') {
      const clubUsers = await User.find({ role: { $in: ['Club', 'Admin'] } }).select('_id');
      matchStage.author = { $in: clubUsers.map((u) => u._id) };
    }

    if (sortMode === 'new') {
      // ── Fast path: pure chronological (no ranking math needed) ───────────
      const [posts, total] = await Promise.all([
        Post.find(matchStage)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('author',   'displayName role instituteEmail rollNo avatarUrl')
          .populate('mentions', 'displayName _id'),
        Post.countDocuments(matchStage),
      ]);

      return res.status(200).json({
        success: true,
        data:    posts,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }

    // ── Ranked path: aggregation pipeline ────────────────────────────────────
    const pipeline = [
      { $match: matchStage },

      // ── Step 1-3: compute ranking score ───────────────────────────────────
      {
        $addFields: {
          _likeCount:    { $size: '$likes' },
          _dislikeCount: { $size: '$dislikes' },
          _ageHours: {
            // ($$NOW - createdAt) in ms → hours
            // $$NOW is a MongoDB Date variable; $subtract of two Dates → ms
            $divide: [
              { $subtract: ['$$NOW', '$createdAt'] },
              3_600_000, // ms → hours
            ],
          },
        },
      },
      {
        $addFields: {
          // net_score = max(0, L - D)
          _netScore: {
            $max: [0, { $subtract: ['$_likeCount', '$_dislikeCount'] }],
          },
        },
      },
      {
        $addFields: {
          // time_decay = 1 / (1 + age_hours / H)
          _timeDecay: {
            $divide: [1, { $add: [1, { $divide: ['$_ageHours', H] }] }],
          },
        },
      },
      {
        $addFields: {
          // score = (net_score + 1)^G * time_decay
          // MongoDB has no $pow for non-integer exponents, so we use $exp + $ln:
          //   x^G  = exp(G * ln(x))
          _score: {
            $multiply: [
              {
                $exp: {
                  $multiply: [
                    G,
                    { $ln: { $add: ['$_netScore', 1] } },
                  ],
                },
              },
              '$_timeDecay',
            ],
          },
        },
      },

      // ── Step 4: sort by score desc, then createdAt desc (tiebreaker) ──────
      { $sort: { _score: -1, createdAt: -1 } },

      // ── Pagination ────────────────────────────────────────────────────────
      {
        $facet: {
          data:  [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await Post.aggregate(pipeline);
    const total = result.total[0]?.count ?? 0;
    const rawPosts = result.data;

    // Populate author + mentions (aggregation doesn't support .populate())
    await Post.populate(rawPosts, [
      { path: 'author',   select: 'displayName role instituteEmail rollNo avatarUrl' },
      { path: 'mentions', select: 'displayName _id' },
    ]);

    return res.status(200).json({
      success: true,
      data:    rawPosts,
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
    const { title, description, imageUrl, hashtag, expiresAt, customTags, totalFare } = req.body;

    // Enforce that every post must have an image
    if (!imageUrl || !imageUrl.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Every post must include an image.',
      });
    }

    // Enforce that every post must have a hashtag
    if (!hashtag || hashtag === 'None') {
      return res.status(400).json({
        success: false,
        message: 'A hashtag is mandatory for every post.',
      });
    }

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
      hashtag:    hashtag,
      customTags: Array.isArray(customTags) ? customTags : [],
      expiresAt:  TIMED_HASHTAGS.has(hashtag) ? new Date(expiresAt) : null,
      mentions:   mentionIds,
      totalFare:  hashtag === '#cabsplit' && totalFare ? Number(totalFare) : null,
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

    const allowedFields = ['title', 'description', 'imageUrl', 'hashtag', 'expiresAt', 'customTags', 'totalFare'];
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
