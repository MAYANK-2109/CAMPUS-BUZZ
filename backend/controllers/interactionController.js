/**
 * controllers/interactionController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles likes, dislikes, comments, and club follows.
 */

const Post         = require('../models/Post');
const Comment      = require('../models/Comment');
const User         = require('../models/User');
const Notification = require('../models/Notification');
const { emitNotifications } = require('../socket');

// ── Helper: fire-and-forget notification creation ─────────────────────────────
const createNotification = async ({ recipient, sender, type, post, message }) => {
  try {
    if (recipient.toString() === sender.toString()) return; // Don't notify yourself
    await emitNotifications([{ recipient, sender, type, post: post || null, message }]);
  } catch (err) {
    console.error('[Notification] failed to create:', err.message);
  }
};

// ── POST /api/posts/:id/like ──────────────────────────────────────────────────
exports.toggleLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const userId   = req.user._id.toString();
    const hasLiked = post.likes.map(id => id.toString()).includes(userId);

    if (hasLiked) {
      post.likes.pull(req.user._id);
    } else {
      post.likes.addToSet(req.user._id);
      post.dislikes.pull(req.user._id); // remove dislike if switching
      // Notify post author
      createNotification({
        recipient: post.author,
        sender:    req.user._id,
        type:      'like',
        post:      post._id,
        message:   `${req.user.displayName} liked your post.`,
      });
    }

    await post.save();
    return res.status(200).json({ success: true, likes: post.likes.length, dislikes: post.dislikes.length, liked: !hasLiked, disliked: false });
  } catch (err) {
    console.error('[interactionController.toggleLike]', err);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ── POST /api/posts/:id/dislike ───────────────────────────────────────────────
exports.toggleDislike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const userId      = req.user._id.toString();
    const hasDisliked = post.dislikes.map(id => id.toString()).includes(userId);

    if (hasDisliked) {
      post.dislikes.pull(req.user._id);
    } else {
      post.dislikes.addToSet(req.user._id);
      post.likes.pull(req.user._id); // remove like if switching
      createNotification({
        recipient: post.author,
        sender:    req.user._id,
        type:      'dislike',
        post:      post._id,
        message:   `${req.user.displayName} disliked your post.`,
      });
    }

    await post.save();
    return res.status(200).json({ success: true, likes: post.likes.length, dislikes: post.dislikes.length, liked: false, disliked: !hasDisliked });
  } catch (err) {
    console.error('[interactionController.toggleDislike]', err);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ── GET /api/posts/:id/comments ───────────────────────────────────────────────
exports.getComments = async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', 'displayName avatarUrl role');
    return res.status(200).json({ success: true, data: comments });
  } catch (err) {
    console.error('[interactionController.getComments]', err);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ── POST /api/posts/:id/comments ─────────────────────────────────────────────
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'Comment text required.' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const comment = await Comment.create({ post: req.params.id, author: req.user._id, text: text.trim() });
    await comment.populate('author', 'displayName avatarUrl role');

    // Notify post author
    createNotification({
      recipient: post.author,
      sender:    req.user._id,
      type:      'comment',
      post:      post._id,
      message:   `${req.user.displayName} commented on your post.`,
    });

    return res.status(201).json({ success: true, data: comment });
  } catch (err) {
    console.error('[interactionController.addComment]', err);
    if (err.name === 'ValidationError') {
      return res.status(422).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(' ') });
    }
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ── POST /api/users/:id/follow ────────────────────────────────────────────────
exports.followClub = async (req, res) => {
  try {
    const clubId  = req.params.id;
    const userId  = req.user._id;

    const club = await User.findById(clubId);
    if (!club) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!['Club', 'Admin'].includes(club.role)) {
      return res.status(400).json({ success: false, message: 'You can only follow Club or Admin accounts.' });
    }

    const alreadyFollowing = club.followers.map(id => id.toString()).includes(userId.toString());

    if (alreadyFollowing) {
      // Unfollow
      club.followers.pull(userId);
      await User.findByIdAndUpdate(userId, { $pull: { following: clubId } });
      await club.save();
      return res.status(200).json({ success: true, following: false, followers: club.followers.length });
    } else {
      // Follow
      club.followers.addToSet(userId);
      await User.findByIdAndUpdate(userId, { $addToSet: { following: clubId } });
      await club.save();

      createNotification({
        recipient: clubId,
        sender:    userId,
        type:      'follow',
        message:   `${req.user.displayName} started following you.`,
      });

      return res.status(200).json({ success: true, following: true, followers: club.followers.length });
    }
  } catch (err) {
    console.error('[interactionController.followClub]', err);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ── POST /api/posts/:id/save ──────────────────────────────────────────────────
/**
 * Toggle-save a post for the authenticated user.
 * Saved posts are stored privately in User.savedPosts — not visible to others.
 * Returns { saved: boolean } indicating the new state.
 */
exports.toggleSavePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    // Confirm the post exists and is active
    const post = await Post.findById(postId).select('_id isActive');
    if (!post || !post.isActive) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const user = await User.findById(userId).select('savedPosts');
    const alreadySaved = user.savedPosts.map(id => id.toString()).includes(postId.toString());

    if (alreadySaved) {
      await User.findByIdAndUpdate(userId, { $pull: { savedPosts: postId } });
      return res.status(200).json({ success: true, saved: false });
    } else {
      await User.findByIdAndUpdate(userId, { $addToSet: { savedPosts: postId } });
      return res.status(200).json({ success: true, saved: true });
    }
  } catch (err) {
    console.error('[interactionController.toggleSavePost]', err);
    return res.status(500).json({ success: false, message: 'Failed to save post.' });
  }
};

// ── GET /api/users/me/saved ───────────────────────────────────────────────────
/**
 * Return the authenticated user's private saved posts list.
 * Ordered by save-time (newest first via reverse).
 * No user-ID param — strictly self-only, no way to peek at others' saves.
 */
exports.getSavedPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('savedPosts')
      .populate({
        path:     'savedPosts',
        match:    { isActive: true },   // Don't surface expired/deleted posts
        populate: { path: 'author', select: 'displayName role instituteEmail rollNo avatarUrl' },
      });

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Return in reverse order (most recently saved first)
    const saved = [...(user.savedPosts || [])].reverse();
    return res.status(200).json({ success: true, data: saved });
  } catch (err) {
    console.error('[interactionController.getSavedPosts]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch saved posts.' });
  }
};
