/**
 * scripts/backfill-keywords.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off backfill of Post.keywords for #lost / #found posts created before
 * the matcher existed.
 *
 * Without this the feature silently does nothing for every post already in the
 * database: they have an empty keywords array, so the `$in` candidate lookup
 * never returns them and a new post can only ever match posts made after the
 * deploy. Run once after deploying.
 *
 *   node scripts/backfill-keywords.js          # write
 *   node scripts/backfill-keywords.js --dry    # report only, change nothing
 *
 * Safe to re-run: it recomputes from the post's own title and description and
 * writes the same result every time.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { extractKeywords } = require('../utils/lostFoundMatcher');

const DRY_RUN = process.argv.includes('--dry');

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Nothing to do.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const Post = require('../models/Post');

  const posts = await Post.find({ hashtag: { $in: ['#lost', '#found'] } })
    .select('_id title description hashtag keywords')
    .lean();

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}found ${posts.length} #lost/#found post(s)\n`);

  let updated = 0;
  let empty   = 0;

  for (const post of posts) {
    const keywords = extractKeywords(post.title, post.description);

    if (keywords.length === 0) {
      // Every word was a stop word. Harmless, but worth surfacing — such a post
      // can never match anything, and that is a content problem, not a bug.
      empty += 1;
      console.log(`  (no keywords) ${post.hashtag} "${String(post.title).slice(0, 40)}"`);
      continue;
    }

    const unchanged =
      Array.isArray(post.keywords) &&
      post.keywords.length === keywords.length &&
      post.keywords.every((k, i) => k === keywords[i]);

    if (unchanged) continue;

    if (!DRY_RUN) {
      await Post.updateOne({ _id: post._id }, { $set: { keywords } });
    }
    updated += 1;
    console.log(`  ${post.hashtag.padEnd(7)} "${String(post.title).slice(0, 34).padEnd(36)}" → ${keywords.slice(0, 8).join(', ')}`);
  }

  console.log(
    `\n${DRY_RUN ? 'would update' : 'updated'} ${updated} post(s)` +
    (empty ? `, ${empty} had no usable keywords` : ''),
  );

  await mongoose.disconnect();
})().catch((err) => {
  console.error('[backfill-keywords] failed:', err.message);
  process.exit(1);
});
