/**
 * cron/postExpiry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Background job: soft-delete expired time-sensitive posts.
 *
 * Runs every 5 minutes.
 * Targets posts where:
 *   - hashtag ∈ { '#foodsplit', '#cabsplit' }
 *   - expiresAt < now
 *   - isActive === true  (avoid re-processing already-deactivated posts)
 *
 * On match: sets isActive = false and deactivates the associated ChatRoom
 * so no new messages can be sent in the expired room.
 *
 * IMPORTANT: This module is loaded once at server startup (server.js) and
 * must NOT be imported from any controller or request handler. Side effects
 * (DB writes) must only occur through the cron schedule, not inline API code.
 */

const cron         = require('node-cron');
const Post         = require('../models/Post');
const ChatRoom     = require('../models/ChatRoom');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');

// ── Hashtags whose posts are subject to time-based expiry ────────────────────
const EXPIRY_HASHTAGS = ['#foodsplit', '#cabsplit'];

/**
 * notifyPreExpiry
 * ───────────────
 * Fires a one-time in-app notification to the post author when the post is
 * 30–35 minutes from expiry. The 5-minute cron window means we query a 35-min
 * upper bound and guard against re-firing with `expiryWarned: false`.
 */
const notifyPreExpiry = async () => {
  const now     = new Date();
  const in35min = new Date(now.getTime() + 35 * 60 * 1000);

  const soonPosts = await Post.find({
    hashtag:      { $in: EXPIRY_HASHTAGS },
    isActive:     true,
    expiryWarned: false,
    expiresAt:    { $gt: now, $lte: in35min },
  }).select('_id title author hashtag expiresAt');

  if (!soonPosts.length) return { warned: 0 };

  const postIds = soonPosts.map(p => p._id);

  // Build notifications for each author
  const notifs = soonPosts.map(p => ({
    recipient: p.author,
    type:      'expiry_warning',
    post:      p._id,
    message:   `Your post "${p.title}" (${p.hashtag}) will expire in ~30 minutes and be removed automatically.`,
  }));

  await Notification.insertMany(notifs);
  await Post.updateMany({ _id: { $in: postIds } }, { $set: { expiryWarned: true } });

  return { warned: soonPosts.length };
};

/**
 * expireOldPosts
 * ──────────────
 * Core business logic extracted into a named async function so it can be
 * unit-tested independently of the cron schedule.
 *
 * @returns {{ deactivatedPosts: number, deactivatedRooms: number }}
 */
const expireOldPosts = async () => {
  const now = new Date();

  // ── 1. Find all posts that should be expired ──────────────────────────────
  const expiredPosts = await Post.find({
    hashtag:  { $in: EXPIRY_HASHTAGS },
    expiresAt: { $lt: now },
    isActive:  true,
  }).select('_id');

  if (expiredPosts.length === 0) {
    return { deactivatedPosts: 0, deactivatedRooms: 0 };
  }

  const postIds = expiredPosts.map((p) => p._id);

  // ── 2. Soft-delete the posts ──────────────────────────────────────────────
  const postResult = await Post.updateMany(
    { _id: { $in: postIds } },
    { $set: { isActive: false } }
  );

  // ── 3. Deactivate associated ChatRooms ────────────────────────────────────
  // This prevents new socket messages from being accepted in expired rooms
  // (the socket handler also checks room.isActive before persisting messages)
  const roomResult = await ChatRoom.updateMany(
    { postId: { $in: postIds }, isActive: true },
    { $set: { isActive: false } }
  );

  return {
    deactivatedPosts: postResult.modifiedCount,
    deactivatedRooms: roomResult.modifiedCount,
  };
};

/**
 * closeIdleGlobalRooms
 * ─────────────────────
 * Auto-closes global hub rooms that have had no message activity for 2 hours.
 * Uses lastMessageAt as the activity indicator.
 *
 * @returns {{ closedRooms: number }}
 */
const closeIdleGlobalRooms = async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const result = await ChatRoom.updateMany(
    {
      isGlobal:  true,
      isActive:  true,
      lastMessageAt: { $lt: twoHoursAgo },
    },
    { $set: { isActive: false } }
  );

  return { closedRooms: result.modifiedCount };
};

/**
 * expireAnnouncements
 * ───────────────────
 * Soft-deletes announcements whose expiresAt has passed.
 */
const expireAnnouncements = async () => {
  const result = await Announcement.updateMany(
    { isActive: true, expiresAt: { $lt: new Date() } },
    { $set: { isActive: false } }
  );
  return { expiredAnnouncements: result.modifiedCount };
};

/**
 * startPostExpiryCron
 * ───────────────────
 * Registers the cron schedule. Called once from server.js after the DB
 * connection is established.
 *
 * Schedule: every 5 minutes  →  '* /5 * * * *'
 */
const startPostExpiryCron = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log(`[CRON] Maintenance job triggered at ${new Date().toISOString()}`);

    try {
      const { warned } = await notifyPreExpiry();
      if (warned > 0) {
        console.log(`[CRON] preExpiry: sent ${warned} expiry warning notification(s).`);
      }

      const { deactivatedPosts, deactivatedRooms } = await expireOldPosts();
      if (deactivatedPosts > 0) {
        console.log(`[CRON] postExpiry: deactivated ${deactivatedPosts} post(s), ${deactivatedRooms} chat room(s).`);
      } else {
        console.log('[CRON] postExpiry: no expired posts found.');
      }

      const { closedRooms } = await closeIdleGlobalRooms();
      if (closedRooms > 0) {
        console.log(`[CRON] globalRooms: closed ${closedRooms} idle room(s) (2hr inactivity).`);
      }

      const { expiredAnnouncements } = await expireAnnouncements();
      if (expiredAnnouncements > 0) {
        console.log(`[CRON] announcements: expired ${expiredAnnouncements} announcement(s).`);
      }
    } catch (err) {
      console.error('[CRON] Maintenance job failed:', err.message, err.stack);
    }
  });

  console.log('[CRON] Post expiry job scheduled (every 5 minutes).');
};

module.exports = { startPostExpiryCron, expireOldPosts, notifyPreExpiry, closeIdleGlobalRooms, expireAnnouncements };
