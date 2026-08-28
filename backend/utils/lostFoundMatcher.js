/**
 * utils/lostFoundMatcher.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Keyword matcher for #lost / #found posts.
 *
 * When someone posts "lost my black wallet near the library", anyone who
 * already posted "found a black wallet outside library" should hear about it
 * immediately — not whenever one of them happens to scroll the feed.
 *
 * Deliberately plain: lowercase, strip punctuation, split on whitespace, drop
 * stop words, count how many words two posts share. No models, no embeddings,
 * no external services. Set intersection over a hash set, nothing more.
 *
 * ── Why keywords are stored on the Post ─────────────────────────────────────
 * Tokenising every existing post on every new post would be O(n) string work
 * per submission and grow with the feed. Instead each post's keywords are
 * computed once at write time and stored in Post.keywords, which is indexed.
 * Finding candidates is then one indexed `$in` lookup — the database narrows
 * to posts sharing at least one keyword, and the intersection maths runs in JS
 * over that short list rather than over the whole collection.
 */

const STOP_WORDS = new Set([
  // articles, conjunctions, prepositions
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'because',
  'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off', 'on', 'onto',
  'out', 'over', 'to', 'up', 'with', 'without', 'near', 'about', 'after',
  'before', 'between', 'under', 'above', 'during', 'while',
  // pronouns and determiners
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them',
  'their', 'theirs', 'this', 'that', 'these', 'those', 'which', 'who', 'whom',
  'whose', 'what', 'where', 'when', 'why', 'how', 'any', 'some', 'each',
  // verbs and auxiliaries
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have',
  'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can',
  'could', 'may', 'might', 'must', 'get', 'got', 'go', 'went', 'gone',
  // filler that appears in almost every post
  'please', 'kindly', 'anyone', 'someone', 'anybody', 'somebody', 'help',
  'urgent', 'asap', 'thanks', 'thank', 'contact', 'dm', 'msg', 'message',
  'call', 'ping', 'reply', 'post', 'update', 'guys', 'plz', 'pls',
  'today', 'yesterday', 'tomorrow', 'morning', 'evening', 'night', 'afternoon',
  'very', 'really', 'just', 'also', 'too', 'much', 'many', 'more', 'most',
  'not', 'no', 'yes', 'all', 'here', 'there', 'now', 'still', 'again',

  /**
   * "lost" and "found" themselves are stop words. Every post in this feature
   * contains one of them, so leaving them in would hand every pair a free
   * point of overlap and make the threshold meaningless.
   */
  'lost', 'found', 'losing', 'finding', 'missing', 'misplaced',
]);

/** Words shorter than this carry no signal ("a", "of"), but "id" and "sim" do. */
const MIN_KEYWORD_LENGTH = 2;

/** Shared keywords required to call it a match. */
const MATCH_THRESHOLD = Number(process.env.LOSTFOUND_MATCH_THRESHOLD) || 2;

/**
 * Most matches to notify about per new post. A generic post ("lost black bag")
 * can overlap dozens of others; sending forty notifications would train the
 * user to ignore all of them. The strongest few are the useful ones.
 */
const MAX_MATCHES_NOTIFIED = Number(process.env.LOSTFOUND_MAX_MATCHES) || 5;

const OPPOSITE = { '#lost': '#found', '#found': '#lost' };

/**
 * sanitize
 * ────────
 * Lowercase, then replace every character that is not a letter, digit or space
 * with a space. Replacing rather than deleting keeps "wallet,black" from
 * fusing into one token. Digits are kept: "iphone 13" and "room 214" are
 * exactly the details that identify an item.
 */
const sanitize = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * extractKeywords
 * ───────────────
 * @param   {string} title
 * @param   {string} description
 * @returns {string[]} Unique, stop-word-free keywords.
 *
 * Returned de-duplicated: a description repeating "wallet" four times should
 * not count as four points of overlap with another post that says it once.
 */
const extractKeywords = (title = '', description = '') => {
  const words = sanitize(`${title} ${description}`).split(' ');

  const keywords = new Set();
  for (const word of words) {
    if (word.length < MIN_KEYWORD_LENGTH) continue;
    if (STOP_WORDS.has(word)) continue;
    keywords.add(word);
  }
  return [...keywords];
};

/**
 * countOverlap
 * ────────────
 * Set intersection size. The smaller array is iterated and the larger is the
 * lookup set, so cost is O(min(a, b)) with O(1) membership tests.
 */
const countOverlap = (a = [], b = []) => {
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  const lookup = new Set(large);

  const shared = [];
  for (const word of small) {
    if (lookup.has(word)) shared.push(word);
  }
  return shared;
};

/**
 * findMatches
 * ───────────
 * Finds active posts in the OPPOSITE category sharing at least
 * MATCH_THRESHOLD keywords with the given post.
 *
 * @param   {object} post  A saved Post document (needs _id, hashtag, keywords, author).
 * @returns {Promise<Array<{post: object, shared: string[], score: number}>>}
 *          Sorted strongest first, capped at MAX_MATCHES_NOTIFIED.
 *
 * The `$in` is an indexed lookup, not a search engine: it asks the database for
 * posts sharing at least ONE keyword, which is a cheap superset of the answer.
 * The real threshold test is the plain set intersection below, in JS.
 */
const findMatches = async (post) => {
  const Post = require('../models/Post');

  const opposite = OPPOSITE[post.hashtag];
  const keywords = post.keywords || [];

  // Nothing to match on: a post of nothing but stop words ("lost it please").
  if (!opposite || keywords.length === 0) return [];

  const candidates = await Post.find({
    hashtag:  opposite,
    isActive: true,
    keywords: { $in: keywords },
    _id:      { $ne: post._id },
    // Skip the author's own posts. Someone who lost a phone and also found a
    // wallet does not need to be told the two might be the same item.
    author:   { $ne: post.author },
  })
    .select('_id title author keywords hashtag')
    .populate('author', 'displayName')
    .lean();

  return candidates
    .map((candidate) => {
      const shared = countOverlap(keywords, candidate.keywords || []);
      return { post: candidate, shared, score: shared.length };
    })
    .filter((m) => m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES_NOTIFIED);
};

/** The alert text, identical for both sides of a match. */
const MATCH_MESSAGE = 'A post with a similar product has been found. Please check the post to verify.';

/**
 * notifyMatches
 * ─────────────
 * Alerts both owners for every match: the author of the new post and the
 * author of each existing post it matched.
 *
 * Each notification points at the OTHER person's post, so tapping it opens the
 * thing they need to look at rather than the one they already wrote.
 */
const notifyMatches = async (newPost, matches) => {
  if (!matches.length) return 0;

  const { emitNotifications } = require('../socket');
  const notifications = [];

  for (const match of matches) {
    const otherAuthorId = match.post.author?._id || match.post.author;

    // → owner of the new post, pointing at the existing post
    notifications.push({
      recipient: newPost.author,
      sender:    otherAuthorId,
      type:      'match',
      post:      match.post._id,
      message:   MATCH_MESSAGE,
    });

    // → owner of the existing post, pointing at the new post
    notifications.push({
      recipient: otherAuthorId,
      sender:    newPost.author,
      type:      'match',
      post:      newPost._id,
      message:   MATCH_MESSAGE,
    });
  }

  await emitNotifications(notifications);
  return notifications.length;
};

/**
 * runLostFoundMatch
 * ─────────────────
 * The entry point. Call immediately after a #lost or #found post is saved.
 *
 * Never throws and never returns a rejected promise: matching is a convenience
 * on top of posting, and a failure here must not fail the post that was already
 * written. Callers may safely ignore the result.
 *
 * @param   {object} post A saved Post document.
 * @returns {Promise<{matched: number, notified: number, skipped?: string}>}
 */
const runLostFoundMatch = async (post) => {
  try {
    if (!post || !OPPOSITE[post.hashtag]) {
      return { matched: 0, notified: 0, skipped: 'not a #lost/#found post' };
    }
    if (!post.isActive) {
      return { matched: 0, notified: 0, skipped: 'post is not active' };
    }

    const matches = await findMatches(post);
    if (!matches.length) return { matched: 0, notified: 0 };

    const notified = await notifyMatches(post, matches);

    console.log(
      `[lostFound] ${post.hashtag} ${post._id} matched ${matches.length} post(s) ` +
      `— ${notified} notifications ` +
      `[${matches.map((m) => `${m.post._id}:${m.score}(${m.shared.join('+')})`).join(', ')}]`,
    );

    return { matched: matches.length, notified };
  } catch (err) {
    console.error('[lostFound] matching failed:', err.message);
    return { matched: 0, notified: 0, skipped: `error: ${err.message}` };
  }
};

module.exports = {
  STOP_WORDS,
  MATCH_THRESHOLD,
  MAX_MATCHES_NOTIFIED,
  MATCH_MESSAGE,
  OPPOSITE,
  sanitize,
  extractKeywords,
  countOverlap,
  findMatches,
  notifyMatches,
  runLostFoundMatch,
};
