/**
 * utils/moderation/policy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Decision fusion. Turns per-tier scores into one of three actions.
 *
 *   allow  – publish, nothing recorded beyond the verdict
 *   flag   – publish, open a review case, notify Admins
 *   block  – reject with 422, post is never created
 *
 * Two rules here are load-bearing and should not be "simplified" away later:
 *
 *   1. self_harm can never block. Blocking a student who is reaching out is
 *      the worst thing this system could do. It routes to support instead.
 *
 *   2. Profanity alone can never block. Students swear. What escalates
 *      profanity into harassment is the combination the sentiment tier
 *      provides — sustained negative sentiment aimed at a person — and that
 *      combination is computed here rather than in any single tier.
 */

const config = require('./config');
const { CATEGORIES } = require('./lexicon');

/** Categories that may result in an outright block when severe enough. */
const BLOCKABLE = new Set([
  CATEGORIES.HATE,
  CATEGORIES.VIOLENCE,
  CATEGORIES.SEXUAL,
  CATEGORIES.HARASSMENT,
  CATEGORIES.SCAM,
  CATEGORIES.DOXXING,
]);

/** Author-facing explanations. Deliberately do not echo the matched term back. */
const USER_MESSAGES = {
  [CATEGORIES.HATE]:      'This post appears to contain a slur or an attack on someone based on their identity. Campus Buzz does not allow that.',
  [CATEGORIES.VIOLENCE]:  'This post appears to threaten physical harm. Please rewrite it without the threat.',
  [CATEGORIES.SEXUAL]:    'This post appears to contain sexual content or a sexual advance. Please remove it before posting.',
  [CATEGORIES.HARASSMENT]:'This post reads as a personal attack on someone. Criticise the situation, not the person.',
  [CATEGORIES.SCAM]:      'This listing has the hallmarks of a scam — payment demanded upfront with no way to meet. Please add normal exchange details.',
  [CATEGORIES.DOXXING]:   'This post appears to share someone else’s private contact details. Please remove them.',
  [CATEGORIES.SPAM]:      'This post looks like spam. Please remove the repeated text or links.',
  [CATEGORIES.PROFANITY]: 'Please tone down the language before posting.',
};

const SUPPORT_MESSAGE =
  'It sounds like you may be going through something difficult. Your post has been published, ' +
  'and campus counselling services are available to you — you do not have to handle this alone.';

const mergeScores = (...maps) => {
  const out = {};
  for (const map of maps) {
    for (const [cat, score] of Object.entries(map || {})) {
      out[cat] = Math.max(out[cat] || 0, Number(score) || 0);
    }
  }
  return out;
};

const topCategory = (scores) =>
  Object.entries(scores).reduce(
    (best, [cat, score]) => (score > best.score ? { category: cat, score } : best),
    { category: null, score: 0 },
  );

/**
 * applySentimentEscalation
 * ────────────────────────
 * The bridge between the sentiment tier and the lexical tier, and the reason
 * this pipeline can tell these two apart:
 *
 *   "this exam was fucking brutal"      → profanity 0.25, no target  → allow
 *   "you are fucking worthless, @rahul" → profanity 0.25, negative,
 *                                          second-person, mention    → harassment 0.55
 *
 * Neither tier can make that call on its own. Profanity says only that a word
 * was used; sentiment says only that the tone is hostile; the target markers say
 * only that a person is addressed. Harassment is the conjunction.
 */
const applySentimentEscalation = (scores, sentiment, context) => {
  const reasons = [];
  const out = { ...scores };

  const hostile   = sentiment.isStronglyNegative;
  const atAPerson = sentiment.targetsPerson || context.hasMentions;

  if (!hostile || !atAPerson) return { scores: out, reasons };

  const hasProfanity = (scores[CATEGORIES.PROFANITY] || 0) > 0;

  if (hasProfanity) {
    out[CATEGORIES.HARASSMENT] = Math.max(out[CATEGORIES.HARASSMENT] || 0, 0.55);
    reasons.push('hostile tone and profanity directed at a person');
  } else {
    // No bad words at all, but sustained hostility aimed at someone. This is
    // the shape of the bullying that keyword filters miss entirely.
    out[CATEGORIES.HARASSMENT] = Math.max(out[CATEGORIES.HARASSMENT] || 0, 0.38);
    reasons.push('sustained hostile tone directed at a person');
  }

  return { scores: out, reasons };
};

/**
 * decide
 * ──────
 * @param {object} input
 *   lexical   – runLexical() output
 *   sentiment – analyseSentiment() output
 *   semantic  – classify() output (may be unavailable)
 *   context   – { hashtag, authorRole, hasMentions }
 *   tier      – highest tier that actually ran
 */
const decide = ({ lexical, sentiment, classifier, semantic, context, tier }) => {
  const reasons = [];

  const escalated = applySentimentEscalation(
    mergeScores(lexical.scores, classifier?.scores, semantic?.scores),
    sentiment,
    context,
  );
  reasons.push(...lexical.reasons, ...escalated.reasons);

  const scores = escalated.scores;

  // Record what the rules matched. Without this a post can reach the Admin
  // queue on a lexicon hit alone with an empty reasons array, and the reviewer
  // has to guess what tripped — which makes the queue unusable and makes the
  // approve/remove signal worthless for threshold tuning.
  if (lexical.hits.length) {
    const byCategory = lexical.hits.reduce((acc, hit) => {
      (acc[hit.category] = acc[hit.category] || []).push(hit.term);
      return acc;
    }, {});
    for (const [category, terms] of Object.entries(byCategory)) {
      reasons.push(`matched ${category} terms: ${terms.slice(0, 5).join(', ')}`);
    }
  }

  // Report the ML tier's own findings, with the raw label scores a reviewer
  // needs in order to judge whether the calibration in classifier.js is right.
  if (classifier?.available && Object.keys(classifier.scores || {}).length) {
    const top = Object.entries(classifier.raw?.primary || {})
      .filter(([label, score]) => label !== 'OK' && score >= 0.1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, score]) => `${label}:${score.toFixed(2)}`)
      .join(' ');
    reasons.push(
      `ML classifier flagged ${Object.keys(classifier.scores).join(', ')}${top ? ` (${top})` : ''}` +
      (classifier.confused ? ' — low confidence, several categories fired at once, so it cannot block alone' : ''),
    );
  }

  if (semantic?.available && semantic.verdict?.rationale) {
    reasons.push(`Claude: ${semantic.verdict.rationale}`);
  }

  const selfHarmScore = scores[CATEGORIES.SELF_HARM] || 0;
  const requiresSupport = selfHarmScore >= config.flagAt;

  // Self-harm is scored but must not drive an enforcement decision — it is
  // removed from the enforcement view so it can never push a post to 'block'.
  const enforcementScores = { ...scores };
  delete enforcementScores[CATEGORIES.SELF_HARM];

  const top = topCategory(enforcementScores);

  let action = 'allow';

  if (top.category && top.score >= config.blockAt && BLOCKABLE.has(top.category)) {
    action = 'block';
  } else if (top.category && top.score >= config.flagAt) {
    action = 'flag';
  }

  // Fail open: the cheap tiers found something ambiguous and the tier that
  // could have resolved it did not run. Publish, but get a human to look.
  //
  // The note is recorded whenever the tier was attempted and failed, not only
  // when it changed the action — a reviewer needs to know this verdict was
  // reached without the tier that reads intent, whatever the outcome was.
  // The ML tier is the one that reads English abuse. A verdict reached without
  // it is materially weaker, so say so and queue anything borderline.
  if (classifier && !classifier.available) {
    reasons.push(`ML classifier unavailable (${classifier.error}) — verdict from rules and sentiment only`);
    if (action === 'allow' && top.score >= config.grayBandLow) action = 'flag';
  }

  if (semantic && !semantic.available) {
    reasons.push(`Claude tier unavailable (${semantic.error})`);
    if (action === 'allow' && top.score >= config.grayBandLow) action = 'flag';
  }

  if (requiresSupport && action === 'allow') {
    action = 'flag';
    reasons.push('possible self-harm content — routed to support, not enforcement');
  } else if (requiresSupport) {
    reasons.push('possible self-harm content — routed to support, not enforcement');
  }

  // Shadow mode records what it would have done without doing it. This is how
  // thresholds get tuned against real traffic before anyone is ever blocked.
  const intendedAction = action;
  if (config.mode === 'shadow' && action === 'block') {
    action = 'flag';
    reasons.push('shadow mode: would have been blocked');
  }

  const statusFor = { allow: 'clean', flag: 'flagged', block: 'blocked' };

  return {
    action,
    intendedAction,
    status: statusFor[action],
    primaryCategory: top.category,
    maxScore: Number(top.score.toFixed(3)),
    scores: Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, Number(v.toFixed(3))]),
    ),
    requiresSupport,
    supportMessage: requiresSupport ? SUPPORT_MESSAGE : null,
    userMessage: action === 'block'
      ? (USER_MESSAGES[top.category] || 'This post does not meet the community guidelines.')
      : null,
    reasons,
    tier,
    sentiment: {
      comparative: sentiment.comparative,
      stronglyNegative: sentiment.isStronglyNegative,
      targetsPerson: sentiment.targetsPerson,
    },
    features: lexical.features,
    matchedTerms: lexical.hits.map((h) => h.term),
    mlScores: classifier?.available ? classifier.scores : null,
    mlRaw:    classifier?.available ? classifier.raw : null,
    mlError:  classifier && !classifier.available ? classifier.error : null,
    semanticVerdict: semantic?.available ? semantic.verdict : null,
    semanticError: semantic && !semantic.available ? semantic.error : null,
  };
};

module.exports = { decide, BLOCKABLE, USER_MESSAGES, SUPPORT_MESSAGE };
