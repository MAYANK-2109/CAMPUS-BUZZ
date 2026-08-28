/**
 * middleware/moderate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express wrapper around utils/moderation. Mirrors the shape of validate.js:
 * one exported middleware, chained after `protect` so req.user is available.
 *
 *   router.post('/posts', protect, moderatePost, postController.createPost);
 *
 * On block  → 422 with an explanation the author can act on.
 * Otherwise → attaches req.moderation and calls next(); the controller
 *             persists the verdict onto the document.
 *
 * The middleware only ever decides. Notifying Admins and writing the review
 * case belong to the controller, which is the layer that knows the post's _id.
 */

const { moderate } = require('../utils/moderation');
const config       = require('../utils/moderation/config');

/**
 * Mentions are parsed here purely as a signal — createPost does its own
 * authoritative resolution against the User collection afterwards. What the
 * pipeline needs to know is only whether the post addresses somebody, which
 * changes how hostile tone and contact details are scored.
 */
const hasMentions = (description) => /@[\w.]/.test(description || '');

/**
 * Logging. Post text is never written to stdout — on a hosted platform those
 * logs are retained and searchable, and a moderation log full of the campus's
 * most sensitive posts is its own privacy incident. Scores and ids only.
 */
const logVerdict = (req, verdict) => {
  if (verdict.action === 'allow' && !config.logAllVerdicts) return;

  console.log(
    `[moderation] ${verdict.action} user=${req.user?._id} role=${req.user?.role} ` +
    `category=${verdict.primaryCategory || 'none'} score=${verdict.maxScore} ` +
    `tier=${verdict.tier} ${verdict.latencyMs}ms` +
    (verdict.intendedAction !== verdict.action ? ` (shadow: would ${verdict.intendedAction})` : ''),
  );
};

const moderatePost = async (req, res, next) => {
  try {
    const { title, description, customTags, hashtag } = req.body;

    const verdict = await moderate({
      title,
      description,
      customTags:  Array.isArray(customTags) ? customTags : [],
      hashtag:     hashtag || 'None',
      authorRole:  req.user?.role || 'Student',
      hasMentions: hasMentions(description),
    });

    logVerdict(req, verdict);

    if (verdict.action === 'block') {
      return res.status(422).json({
        success: false,
        message: verdict.userMessage,
        moderation: {
          blocked:  true,
          category: verdict.primaryCategory,
          // The author is told what rule they hit and how to proceed, but not
          // the score or the matched term — publishing either turns the 422
          // into a tuning oracle for anyone trying to get around the filter.
          appeal: 'Edit your post and try again, or contact an Admin if you believe this is a mistake.',
        },
      });
    }

    req.moderation = verdict;
    return next();
  } catch (err) {
    // Fail open. A bug in moderation must not make the feed read-only.
    console.error('[moderation] middleware error — allowing post:', err.message);
    req.moderation = {
      status:  'flagged',
      reasons: [`moderation middleware error: ${err.message}`],
      scores:  {},
      tier:    0,
    };
    return next();
  }
};

module.exports = { moderatePost };
