/**
 * utils/moderation/normalize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Text canonicalisation. Runs before every other tier.
 *
 * Without this step the lexical tier is defeated by anything a bored student
 * can type in ten seconds: "f u c k", "fùck", "fuuuuck", or a Cyrillic "а"
 * pasted in place of a Latin one. Normalising first lets the lexicon stay small
 * and readable instead of growing a variant for every spelling.
 *
 * Two deliberate restraints, both learned from what a campus feed actually
 * contains:
 *
 *   1. Digit→letter leet is applied ONLY to tokens that already contain a
 *      letter. "sh1t" normalises to "shit"; "₹3000" stays "3000" instead of
 *      turning into "eoo". Half this app's posts are #resell listings and
 *      #cabsplit fares — mangling numbers would poison every downstream tier.
 *
 *   2. Symbol→letter leet is NOT applied at all. "@" is equally plausible as
 *      "a" (@ss) or "u" (f@ck), and guessing wrong is worse than not guessing.
 *      Symbol censoring is handled by the gap-tolerant matcher in lexical.js,
 *      which treats them as wildcards rather than resolving them.
 *
 * The normalised string is ONLY used for matching. What gets persisted and
 * shown to users is always the author's original text.
 */

// Homoglyphs that render identically to a Latin letter but carry a different
// codepoint — Cyrillic and Greek lookalikes are the ones seen in practice.
const CONFUSABLES = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
  'ѕ': 's', 'і': 'i', 'ј': 'j', 'ԁ': 'd', 'ɡ': 'g', 'ν': 'v', 'κ': 'k',
  'ο': 'o', 'ρ': 'p', 'τ': 't', 'α': 'a', 'ι': 'i', 'ϲ': 'c', 'ԛ': 'q',
};

// Unambiguous digit substitutions only — no symbols. See restraint (2) above.
const DIGIT_LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };

/** Strip zero-width and bidi control characters used to split words invisibly. */
const stripInvisible = (s) => s.replace(/[​-‏‪-‮⁠-⁤﻿]/g, '');

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const mapChars = (s, table) => s.replace(/./gu, (ch) => table[ch] ?? ch);

/**
 * Collapse runs of 3+ identical LETTERS down to two: "fuuuuck" → "fuuck".
 * Stopping at two rather than one preserves legitimate doubles ("committee",
 * "coolest"); the matcher in lexical.js tolerates the leftover repeat.
 *
 * Letters only — never digits. Squashing "9000012345" to "900012345" would
 * take a phone number below ten digits and hide it from the doxxing check.
 */
const collapseRepeats = (s) => s.replace(/([a-z])\1{2,}/gu, '$1$1');

/**
 * Numeric quantities with a short unit suffix: "7pm", "500rs", "2nd", "3km".
 * These contain a letter, so the mixed-token rule below would otherwise leet
 * them into gibberish ("7pm" → "tpm"). Left untouched instead.
 */
const NUMERIC_UNIT = /^\d+[a-z]{1,3}$/;

/**
 * Apply digit leet only to tokens that contain at least one a–z letter and
 * are not a numeric quantity — so "sh1t" resolves but "₹3000" and "7pm" don't.
 */
const leetMixedTokens = (s) =>
  s.split(' ')
    .map((tok) => (/[a-z]/.test(tok) && !NUMERIC_UNIT.test(tok) ? mapChars(tok, DIGIT_LEET) : tok))
    .join(' ');

/**
 * De-space letter-by-letter obfuscation: "f u c k o f f" → "fuckoff".
 * Fires only on runs of 4+ single letters, so prose and initialisms
 * like "B Tech" or "M Tech CSE" are left alone.
 */
const joinSpacedLetters = (s) =>
  s.replace(/\b(?:[a-z]\s+){3,}[a-z]\b/g, (m) => m.replace(/\s+/g, ''));

/**
 * normalize
 * ─────────
 * @param  {string} text
 * @returns {{ matchText: string, rawText: string, tokens: string[] }}
 *
 *   matchText – fully normalised. Punctuation removed, leet resolved, repeats
 *               collapsed. Used for word and phrase matching.
 *   rawText   – lowercased and accent-stripped but otherwise INTACT: symbols,
 *               digits and spacing all preserved. The gap-tolerant matcher
 *               needs the separators still present in order to see through
 *               them ("f-u-c-k", "f@ck").
 *   tokens    – matchText split on whitespace, for exact word matching.
 */
const normalize = (text) => {
  if (!text || typeof text !== 'string') {
    return { matchText: '', rawText: '', tokens: [] };
  }

  const base = stripAccents(
    mapChars(stripInvisible(text.normalize('NFKC').toLowerCase()), CONFUSABLES),
  );

  const rawText = collapseRepeats(base).replace(/\s+/g, ' ').trim();

  let s = base.replace(/[^a-z0-9\s]/g, ' ');
  s = collapseRepeats(s).replace(/\s+/g, ' ').trim();
  s = leetMixedTokens(s);
  s = joinSpacedLetters(s);

  return { matchText: s, rawText, tokens: s ? s.split(' ') : [] };
};

module.exports = { normalize };
