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

const cron     = require('node-cron');
const Post     = require('../models/Post');
const ChatRoom = require('../models/ChatRoom');

// ── Hashtags whose posts are subject to time-based expiry ────────────────────
const EXPIRY_HASHTAGS = ['#foodsplit', '#cabsplit'];

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
 * startPostExpiryCron
 * ───────────────────
 * Registers the cron schedule. Called once from server.js after the DB
 * connection is established.
 *
 * Schedule: every 5 minutes  →  '* /5 * * * *'
 */
const startPostExpiryCron = () => {
  // node-cron expression: second(opt) minute hour day-of-month month day-of-week
  // '*/5 * * * *'  = at every 5th minute
  cron.schedule('*/5 * * * *', async () => {
    console.log(`[CRON] postExpiry job triggered at ${new Date().toISOString()}`);

    try {
      const { deactivatedPosts, deactivatedRooms } = await expireOldPosts();

      if (deactivatedPosts > 0) {
        console.log(
          `[CRON] postExpiry: deactivated ${deactivatedPosts} post(s), ` +
          `${deactivatedRooms} chat room(s).`
        );
      } else {
        console.log('[CRON] postExpiry: no expired posts found.');
      }
    } catch (err) {
      // Log the error but do NOT rethrow – a cron failure must never crash the server
      console.error('[CRON] postExpiry job failed:', err.message, err.stack);
    }
  });

  console.log('[CRON] Post expiry job scheduled (every 5 minutes).');
};

module.exports = { startPostExpiryCron, expireOldPosts };
