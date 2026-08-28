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
const ChatRoom     = require('../models/ChatRoom');
const { emitNotifications } = require('../socket');
const { extractKeywords, runLostFoundMatch } = require('../utils/lostFoundMatcher');

// ── Allowed time-sensitive hashtags that need an expiresAt ───────────────────
const TIMED_HASHTAGS = new Set(['#foodsplit', '#cabsplit']);

// ── Hashtags that automatically get a Socket.io chat room ───────────────────
// (mirrors the same set in socket/index.js)
const CHAT_HASHTAGS = new Set(['#foodsplit', '#cabsplit', '#resell']);

// ── Hashtags that participate in keyword matching (utils/lostFoundMatcher) ──
const LOST_FOUND_HASHTAGS = new Set(['#lost', '#found']);

// ── Feed-ranking constants (tunable via env or query params) ──────────────────
const DEFAULT_G = 0.8;   // gravity   – higher = popularity wins more
const DEFAULT_H = 12;    // half-life – hours after which time-boost halves

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Moderation helpers ───────────────────────────────────────────────────────
// The verdict itself is produced by middleware/moderate.js before this
// controller runs; everything below is about persisting it and getting a human
// in front of the posts that need one.

/**
 * Maps a pipeline verdict onto the Post.moderation subdocument.
 * Defensive about a missing verdict so the controller still works if the route
 * is ever wired without the middleware.
 */
const buildModerationDoc = (verdict) => {
  if (!verdict) return { status: 'clean' };

  return {
    status:          verdict.status === 'blocked' ? 'flagged' : (verdict.status || 'clean'),
    primaryCategory: verdict.primaryCategory || null,
    maxScore:        verdict.maxScore || 0,
    scores:          verdict.scores || {},
    tier:            verdict.tier || 0,
    reasons:         verdict.reasons || [],
    requiresSupport: Boolean(verdict.requiresSupport),
    pipelineVersion: verdict.pipelineVersion || null,
    llmModel:        verdict.llmModel || null,
    latencyMs:       verdict.latencyMs || 0,
  };
};

/**
 * Fans a review notification out to every Admin.
 *
 * Two different messages on purpose. A possible self-harm post is not a
 * rule violation and must not land in an Admin's queue looking like one —
 * it needs a person to reach out, not a takedown decision.
 *
 * Fire-and-forget: a notification failure must never fail the post that was
 * already written.
 */
const notifyAdminsOfFlag = async (post, verdict, author) => {
  try {
    const admins = await User.find({ role: 'Admin' }).select('_id').lean();
    if (!admins.length) return;

    const message = verdict.requiresSupport
      ? `Wellbeing check: a post by ${author.displayName} may indicate distress. Please reach out.`
      : `Flagged for review (${verdict.primaryCategory}, ${verdict.maxScore}): "${post.title}" by ${author.displayName}`;

    await emitNotifications(
      admins.map((admin) => ({
        recipient: admin._id,
        sender:    author._id,
        type:      'moderation',
        post:      post._id,
        message,
      })),
    );
  } catch (err) {
    console.error('[postController] moderation notification failed:', err.message);
  }
};

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
    } else if (req.query.excludeHashtag) {
      matchStage.hashtag = { $ne: req.query.excludeHashtag };
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

    // Populate author + mentions + linkedEvent (aggregation doesn't support .populate())
    await Post.populate(rawPosts, [
      { path: 'author',      select: 'displayName role instituteEmail rollNo avatarUrl' },
      { path: 'mentions',    select: 'displayName _id' },
      { path: 'linkedEvent', select: 'title date venue eventType' },
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


// ── GET /api/rides ───────────────────────────────────────────────────────────
// Dedicated Ride Split discovery. A destination matches either the ride's final
// destination or one of its declared route stops, allowing a rider to join a
// longer trip that passes through the place they need.
exports.getRides = async (req, res) => {
  try {
    const destination = (req.query.destination || '').trim().slice(0, 120);
    const match = {
      hashtag: '#cabsplit',
      isActive: true,
      'ride.destination': { $exists: true, $ne: '' },
      'ride.departureTime': { $gt: new Date() },
    };

    if (destination) {
      const destinationRegex = new RegExp(escapeRegExp(destination), 'i');
      match.$or = [
        { 'ride.destination': destinationRegex },
        { 'ride.routeStops': destinationRegex },
      ];
    }

    const posts = await Post.find(match)
      .sort({ 'ride.departureTime': 1 })
      .limit(50)
      .populate('author', 'displayName role avatarUrl rollNo')
      .lean();

    const rooms = await ChatRoom.find({ postId: { $in: posts.map((post) => post._id) } })
      .select('postId participants isActive')
      .lean();
    const roomByPost = new Map(rooms.map((room) => [room.postId.toString(), room]));
    const userId = req.user._id.toString();
    const needle = destination.toLocaleLowerCase('en-IN');

    const rides = posts.map((post) => {
      const room = roomByPost.get(post._id.toString());
      const participantIds = [...new Set((room?.participants || []).map((id) => id.toString()))];
      const seatsFilled = participantIds.length || 1;
      const totalSeats = post.ride?.totalSeats || 4;
      const destinationMatch = needle && post.ride.destination.toLocaleLowerCase('en-IN').includes(needle);

      return {
        ...post,
        seatsFilled,
        isJoined: participantIds.includes(userId) || post.author?._id?.toString() === userId,
        isFull: seatsFilled >= totalSeats || room?.isActive === false,
        matchType: !needle ? 'upcoming' : (destinationMatch ? 'destination' : 'route'),
      };
    });

    return res.json({ success: true, data: rides });
  } catch (err) {
    console.error('[postController.getRides]', err);
    return res.status(500).json({ success: false, message: 'Failed to find matching rides.' });
  }
};


// ── POST /api/rides/:id/join ─────────────────────────────────────────────────
// Capacity is checked in the same atomic update that adds the participant, so
// two students cannot claim the final seat at the same time.
exports.joinRide = async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      hashtag: '#cabsplit',
      isActive: true,
      'ride.destination': { $exists: true },
      'ride.departureTime': { $gt: new Date() },
    }).select('author ride.totalSeats title');

    if (!post) {
      return res.status(404).json({ success: false, message: 'This ride is no longer available.' });
    }

    let room = await ChatRoom.findOne({ postId: post._id });
    if (!room) {
      room = await ChatRoom.create({
        postId: post._id,
        isGlobal: false,
        name: post.title,
        hashtag: '#cabsplit',
        createdBy: post.author,
        participants: [post.author],
        isActive: true,
      });
    }

    const userId = req.user._id;
    const alreadyJoined = room.participants.some((id) => id.toString() === userId.toString());
    if (alreadyJoined || post.author.toString() === userId.toString()) {
      return res.json({
        success: true,
        alreadyJoined: true,
        seatsFilled: Math.max(1, new Set(room.participants.map(String)).size),
      });
    }

    const totalSeats = post.ride.totalSeats || 4;
    const updatedRoom = await ChatRoom.findOneAndUpdate(
      {
        _id: room._id,
        isActive: true,
        participants: { $ne: userId },
        $expr: {
          $lt: [
            { $size: { $ifNull: ['$participants', []] } },
            totalSeats,
          ],
        },
      },
      { $addToSet: { participants: userId } },
      { new: true }
    );

    if (!updatedRoom) {
      return res.status(409).json({ success: false, message: 'This ride is already full.' });
    }

    return res.json({
      success: true,
      seatsFilled: new Set(updatedRoom.participants.map(String)).size,
      message: 'Seat confirmed. You can now coordinate in the ride chat.',
    });
  } catch (err) {
    console.error('[postController.joinRide]', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to join this ride.' });
  }
};


// ── POST /api/posts ───────────────────────────────────────────────────────────
exports.createPost = async (req, res) => {
  try {
    let { title, description, imageUrl, hashtag, expiresAt, customTags, totalFare, ride } = req.body;

    // imageUrl is optional — posts without an image render as text-only.

    // If no primary hashtag provided, default to 'None'
    hashtag = hashtag || 'None';

    // Dedicated Ride Split posts use their departure as the post expiry.
    if (hashtag === '#cabsplit' && ride?.departureTime && !expiresAt) {
      expiresAt = ride.departureTime;
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

    let rideDetails = null;
    if (hashtag === '#cabsplit' && ride) {
      const departureTime = new Date(ride.departureTime);
      const totalSeats = Number(ride.totalSeats);
      const fare = Number(totalFare);
      const destination = String(ride.destination || '').trim();

      if (!destination) {
        return res.status(400).json({ success: false, message: 'Destination is required for a ride.' });
      }
      if (Number.isNaN(departureTime.getTime()) || departureTime <= new Date()) {
        return res.status(400).json({ success: false, message: 'Departure time must be in the future.' });
      }
      if (!Number.isInteger(totalSeats) || totalSeats < 2 || totalSeats > 12) {
        return res.status(400).json({ success: false, message: 'Total seats must be between 2 and 12.' });
      }
      if (!Number.isFinite(fare) || fare <= 0) {
        return res.status(400).json({ success: false, message: 'Total fare must be greater than zero.' });
      }

      rideDetails = {
        from: 'NIT Raipur',
        destination,
        routeStops: Array.isArray(ride.routeStops)
          ? ride.routeStops.map((stop) => String(stop).trim()).filter(Boolean).slice(0, 12)
          : [],
        vehicleType: ['cab', 'auto', 'shared_cab'].includes(ride.vehicleType)
          ? ride.vehicleType
          : 'cab',
        totalSeats,
        departureTime,
      };
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
      imageUrl:   imageUrl?.trim() || null,
      author:     req.user._id,
      hashtag:    hashtag,
      customTags: Array.isArray(customTags) ? customTags : [],
      expiresAt:  TIMED_HASHTAGS.has(hashtag) ? new Date(expiresAt) : null,
      mentions:   mentionIds,
      totalFare:  hashtag === '#cabsplit' && totalFare != null ? Number(totalFare) : null,
      ride:       rideDetails,
      linkedEvent: req.body.linkedEvent || null,
      moderation: buildModerationDoc(req.moderation),
      // Only #lost / #found are matched, so only they need keywords stored.
      keywords: LOST_FOUND_HASHTAGS.has(hashtag) ? extractKeywords(title, description) : [],
    });

    // ── Auto-create a ChatRoom for chat-enabled posts ────────────────────────
    // This ensures the room exists immediately so the first buyer doesn't
    // trigger a race condition on /rooms/from-post/:id.
    if (CHAT_HASHTAGS.has(hashtag)) {
      const roomPayload = {
        isGlobal:      false,
        postId:        post._id,
        name:          post.title,
        hashtag:       post.hashtag,
        createdBy:     post.author,
        participants:  rideDetails ? [post.author] : [],
        isActive:      true,
        lastMessageAt: new Date(),
      };

      // A structured ride must not be discoverable before its capacity record
      // exists. Other post chats keep the existing non-blocking behaviour.
      if (rideDetails) {
        await ChatRoom.create(roomPayload);
      } else {
        ChatRoom.create(roomPayload)
          .catch(err => console.error('[postController] ChatRoom auto-create failed:', err.message));
      }
    }

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
      if (notifs.length > 0) await emitNotifications(notifs);
    }

    // Populate author + mentions for the response
    await post.populate([
      { path: 'author', select: 'displayName role instituteEmail rollNo avatarUrl' },
      { path: 'mentions', select: 'displayName _id' }
    ]);

    // ── Lost & Found auto-match ──────────────────────────────────────────────
    // Fires immediately after the post is saved, against active posts in the
    // opposite category. Not awaited: the matcher swallows its own errors, and
    // the author should not wait on a candidate scan to see their post appear.
    if (LOST_FOUND_HASHTAGS.has(hashtag)) {
      runLostFoundMatch(post);
    }

    // ── Moderation follow-up ─────────────────────────────────────────────────
    // The post is already saved. Flagged posts stay visible while an Admin
    // reviews them — hiding first and asking later would make the filter's
    // false positives indistinguishable from a takedown.
    if (req.moderation?.status === 'flagged') {
      await notifyAdminsOfFlag(post, req.moderation, req.user);
    }

    return res.status(201).json({
      success: true,
      data: post,
      // Surfaced to the author only for possible self-harm content, where the
      // right response is a supportive note rather than an enforcement notice.
      ...(req.moderation?.requiresSupport
        ? { notice: req.moderation.supportMessage }
        : {}),
    });
  } catch (err) {
    console.error('[postController.createPost]', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(422).json({ success: false, message: messages.join(' ') });
    }
    return res.status(500).json({ success: false, message: 'Failed to create post.' });
  }
};

// ── PATCH /api/posts/:id/sold ────────────────────────────────────────────────
/**
 * Marks a #resell listing as sold. One action, three effects:
 *   1. every chat room attached to the post is closed
 *   2. the post is removed from the feed
 *   3. everyone who was chatting about it is told why it vanished
 *
 * Only the author (or an Admin) can do this, and only for #resell — the other
 * chat hashtags have no notion of a sale. #foodsplit and #cabsplit already end
 * themselves through the expiry cron.
 *
 * The post is SOFT-deleted (isActive = false), matching deletePost and the
 * expiry cron. Hard-deleting would orphan the room's message history, and the
 * seller may still need that record of who agreed to what.
 *
 * Ordering matters: the room is closed before the post is deactivated. If the
 * process dies between the two, a closed room on a live post is recoverable
 * (the author simply retries); a live room pointing at a deleted post is not,
 * because joinRoom rejects on a missing post and nobody could reopen it.
 */
exports.markPostSold = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || !post.isActive) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const isAuthor = post.author.toString() === req.user._id.toString();
    if (!isAuthor && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only the seller can mark this item as sold.' });
    }

    if (post.hashtag !== '#resell') {
      return res.status(400).json({
        success: false,
        message: 'Only #resell posts can be marked as sold.',
      });
    }

    // ── 1. Close every room attached to this post ────────────────────────────
    // updateMany, not findOne: findOrCreate has raced in the past and a post can
    // end up with more than one room. Closing only the first would leave a live
    // room behind that nobody can reach.
    const rooms = await ChatRoom.find({ postId: post._id }).select('_id participants isActive').lean();
    await ChatRoom.updateMany({ postId: post._id, isActive: true }, { $set: { isActive: false } });

    // ── 2. Remove the listing from the feed ──────────────────────────────────
    post.isActive = false;
    await post.save();

    // ── 3. Tell the room, then tell the participants ─────────────────────────
    const io = global._io;
    if (io) {
      // Legacy post-linked socket rooms are keyed by postId; Chat Hub rooms are
      // keyed by roomId. Both are emitted because both clients may be open.
      io.to(post._id.toString()).emit('roomClosed', {
        postId:   post._id.toString(),
        closedBy: req.user.displayName,
        message:  `${req.user.displayName} marked this item as sold. The room is now closed.`,
      });

      rooms.forEach((room) => {
        io.to(room._id.toString()).emit('globalRoomClosed', {
          roomId:   room._id.toString(),
          closedBy: req.user.displayName,
        });
      });

      // Feeds drop the card without a refetch; room lists re-fetch.
      io.emit('postSold', { postId: post._id.toString(), title: post.title });
      io.emit('roomsUpdated');
    }

    // Everyone who was in the room gets told, minus the seller. Without this a
    // buyer's chat simply disappears from their list with no explanation.
    const participantIds = [
      ...new Set(
        rooms
          .flatMap((room) => room.participants || [])
          .map((id) => id.toString())
          .filter((id) => id !== post.author.toString()),
      ),
    ];

    if (participantIds.length) {
      await emitNotifications(
        participantIds.map((id) => ({
          recipient: id,
          sender:    req.user._id,
          type:      'sold',
          post:      post._id,
          message:   `"${post.title}" has been sold. The chat room is now closed.`,
        })),
      ).catch((err) => console.error('[postController] sold notification failed:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: 'Marked as sold. The listing has been removed and the chat room closed.',
      data: { postId: post._id, roomsClosed: rooms.length, notified: participantIds.length },
    });
  } catch (err) {
    console.error('[postController.markPostSold]', err);
    return res.status(500).json({ success: false, message: 'Failed to mark this item as sold.' });
  }
};

// ── GET /api/moderation/flagged  (Admin) ─────────────────────────────────────
/**
 * The review queue. Flagging without a queue is theatre — nobody ever sees the
 * flag and the post stays up regardless, so this endpoint is part of the
 * feature, not an extra.
 *
 * Ordered by severity rather than recency: the point of a queue is that the
 * worst thing waiting gets looked at first. Wellbeing cases sort to the very
 * top via ?filter=support.
 */
exports.getFlaggedPosts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const query = { isActive: true, 'moderation.status': 'flagged' };

    if (req.query.filter === 'support')      query['moderation.requiresSupport'] = true;
    else if (req.query.filter === 'violations') query['moderation.requiresSupport'] = false;
    if (req.query.category)                  query['moderation.primaryCategory'] = req.query.category;

    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort({ 'moderation.requiresSupport': -1, 'moderation.maxScore': -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'displayName role instituteEmail rollNo avatarUrl')
        .lean(),
      Post.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: posts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[postController.getFlaggedPosts]', err);
    return res.status(500).json({ success: false, message: 'Failed to load the moderation queue.' });
  }
};

// ── PATCH /api/moderation/:id  (Admin) ───────────────────────────────────────
/**
 * Resolve one flagged post: 'approve' keeps it, 'remove' soft-deletes it.
 *
 * Soft-delete, matching how the expiry cron and deletePost already work —
 * hard-deleting would orphan the post's ChatRoom and its message history.
 *
 * The resolution is written back onto the post rather than just clearing the
 * flag, which is what makes it possible to measure the pipeline later: every
 * approve is a false positive and every remove is a true one, and that is the
 * only honest way to tune the thresholds in config.js.
 */
exports.reviewFlaggedPost = async (req, res) => {
  try {
    const { action, note } = req.body;

    if (!['approve', 'remove'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'remove'." });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    if (post.moderation?.status !== 'flagged') {
      return res.status(409).json({
        success: false,
        message: `This post is not awaiting review (status: ${post.moderation?.status || 'clean'}).`,
      });
    }

    post.moderation.status     = action === 'approve' ? 'approved' : 'removed';
    post.moderation.reviewedBy = req.user._id;
    post.moderation.reviewedAt = new Date();
    if (note) post.moderation.reasons.push(`admin note: ${note}`);

    if (action === 'remove') post.isActive = false;

    await post.save();

    // Tell the author their post came down, and why. A silent removal reads as
    // a bug and generates a support request; this closes the loop.
    if (action === 'remove') {
      await emitNotifications([{
        recipient: post.author,
        sender:    req.user._id,
        type:      'moderation',
        post:      post._id,
        message:   `Your post "${post.title}" was removed after review${note ? `: ${note}` : '.'}`,
      }]).catch((err) => console.error('[postController] removal notice failed:', err.message));
    }

    return res.status(200).json({ success: true, data: post });
  } catch (err) {
    console.error('[postController.reviewFlaggedPost]', err);
    return res.status(500).json({ success: false, message: 'Failed to record the review.' });
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

    // Keywords are derived from title + description, so an edit that changes
    // either must refresh them. Without this a corrected post ("blue" → "black")
    // keeps matching on the wrong word for the rest of its life.
    if (LOST_FOUND_HASHTAGS.has(post.hashtag)) {
      post.keywords = extractKeywords(post.title, post.description);
    }

    // Edits are re-moderated by the same middleware on this route. Without
    // that, "post something clean, then edit in the abuse" is a one-step
    // bypass of the entire pipeline.
    if (req.moderation) {
      post.moderation = buildModerationDoc(req.moderation);
    }

    await post.save();
    await post.populate('author', 'displayName role instituteEmail rollNo');

    if (req.moderation?.status === 'flagged') {
      await notifyAdminsOfFlag(post, req.moderation, req.user);
    }

    return res.status(200).json({
      success: true,
      data: post,
      ...(req.moderation?.requiresSupport ? { notice: req.moderation.supportMessage } : {}),
    });
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

// ── GET /api/posts/trending-hashtags ─────────────────────────────────────────
// Returns the top 5 hashtags by post count. Must be registered BEFORE /:id route.
exports.getTrendingHashtags = async (req, res) => {
  try {
    const trends = await Post.aggregate([
      { $match: { isActive: true, hashtag: { $exists: true } } },
      { $group: { _id: '$hashtag', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { hashtag: '$_id', count: 1, _id: 0 } },
    ]);
    return res.json({ success: true, data: trends });
  } catch (err) {
    console.error('[postController.getTrendingHashtags]', err);
    return res.status(500).json({ success: false, data: [] });
  }
};

// ── POST /api/posts/:id/report ────────────────────────────────────────────────
// Any authenticated non-author user can report a post.
// Fans out a 'report' notification to every Admin account.
exports.reportPost = async (req, res) => {
  try {
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
    await emitNotifications(notifs);

    return res.status(200).json({ success: true, message: 'Report submitted. Our team will review it.' });
  } catch (err) {
    console.error('[postController.reportPost]', err);
    return res.status(500).json({ success: false, message: 'Failed to submit report.' });
  }
};

