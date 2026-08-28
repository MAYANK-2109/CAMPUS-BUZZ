/**
 * utils/moderation/sentiment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2 — sentiment analysis (AFINN-165 via the `sentiment` package).
 *
 * What this tier is for, and what it is NOT for.
 *
 * Sentiment alone is a bad moderator. "This mess food is absolutely disgusting
 * and whoever runs it should be ashamed" scores strongly negative and is a
 * completely legitimate campus complaint — arguably the exact thing this app's
 * Complaint feature exists to host. Blocking on negative sentiment would gut
 * the feed's usefulness.
 *
 * What sentiment IS good for is disambiguating the lexical tier. "This exam was
 * fucking brutal" and "you are fucking worthless" both trip the same profanity
 * term at severity 0.25. Sentiment plus a mention plus a second-person pronoun
 * separates venting-at-a-situation from attacking-a-person, and that is the
 * distinction policy.js acts on.
 *
 * AFINN is English-only, so the extras below add valence for the Hinglish terms
 * that dominate this register. Without them, a post that is pure Hindi abuse
 * scores a clean 0.0 and reads as neutral.
 */

const Sentiment = require('sentiment');
const config    = require('./config');

const analyzer = new Sentiment();

/**
 * Hinglish valence extension, on AFINN's -5…+5 scale.
 * Kept small and centred on terms that carry unambiguous polarity —
 * ambiguous slang is left out rather than guessed at.
 */
const HINGLISH_VALENCE = {
  // strongly negative
  madarchod: -5, behenchod: -5, bhenchod: -5, bhosdike: -5, chutiya: -4,
  chutiye: -4, gandu: -4, harami: -4, kamine: -3, kaminey: -3, kutta: -3,
  kutti: -3, saala: -2, randi: -5, lodu: -4, lauda: -3, nalayak: -3,
  ghatiya: -3, bakwas: -2, bewakoof: -2, pagal: -2, nikamma: -3,
  badtameez: -3, besharam: -3, gandagi: -2, dhokha: -3, chor: -3,
  jhoota: -3, faltu: -2, bekar: -2, barbaad: -3, nafrat: -4, gussa: -2,
  // positive — needed so the comparative score isn't biased negative
  // on ordinary Hinglish posts that merely happen to be informal
  accha: 2, badhiya: 3, shandaar: 3, mast: 2, zabardast: 3, sundar: 2,
  shukriya: 2, dhanyavaad: 2, khush: 3, pyaar: 3, dost: 2, madad: 2,
  behtareen: 3, kamaal: 3,
};

/**
 * Second-person markers. Negative sentiment pointed at "you" is the shape of an
 * attack; pointed at nothing in particular it is usually just venting.
 */
const SECOND_PERSON = new Set([
  'you', 'your', 'youre', 'yours', 'u', 'ur',
  'tu', 'tum', 'tumhe', 'tumhara', 'tera', 'teri', 'tere', 'aap', 'aapka',
]);

/**
 * analyseSentiment
 * ────────────────
 * @param  {string}   matchText Normalised text (leet resolved, punctuation gone).
 * @param  {string[]} tokens
 * @returns {{
 *   score: number, comparative: number, tokenCount: number,
 *   negativeWords: string[], isStronglyNegative: boolean, targetsPerson: boolean
 * }}
 *
 * `comparative` is the per-token average, so a long post is not penalised for
 * containing more words than a short one.
 */
const analyseSentiment = (matchText, tokens) => {
  if (!matchText) {
    return {
      score: 0, comparative: 0, tokenCount: 0,
      negativeWords: [], isStronglyNegative: false, targetsPerson: false,
    };
  }

  const result = analyzer.analyze(matchText, { extras: HINGLISH_VALENCE });

  // Below the minimum length the comparative average is dominated by a single
  // word and swings wildly — three angry words is noise, not a signal.
  const reliable = tokens.length >= config.sentimentMinTokens;

  return {
    score:       result.score,
    comparative: Number(result.comparative.toFixed(3)),
    tokenCount:  tokens.length,
    negativeWords: result.negative,
    isStronglyNegative: reliable && result.comparative <= config.sentimentNegativeAt,
    targetsPerson: tokens.some((t) => SECOND_PERSON.has(t)),
  };
};

module.exports = { analyseSentiment, HINGLISH_VALENCE };
