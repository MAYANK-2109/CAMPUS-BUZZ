/**
 * utils/moderation/lexical.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 1 — deterministic rules. Sub-millisecond, no network, no model.
 *
 * Does three things:
 *   1. Matches the lexicon with a gap-tolerant matcher (see below).
 *   2. Detects contact info / doxxing, in a way that does not break the five
 *      hashtags whose entire purpose is exchanging contact details.
 *   3. Scores spam-shape (shouting, link farming, token repetition).
 *
 * ── The matcher ────────────────────────────────────────────────────────────
 * A plain `includes()` over a wordlist loses to "f-u-c-k" and "f@ck". Rather
 * than resolve those in the normaliser (where "@" is genuinely ambiguous —
 * "a" in @ss, "u" in f@ck), each term is compiled once at load into regexes
 * that see through the obfuscation:
 *
 *   gapped   – separators between letters are optional: f[\W_]{0,2}u[\W_]{0,2}c…
 *              catches "f-u-c-k", "f.u.c.k", "f * u * c * k"
 *   censored – any ONE interior letter may be a symbol: f[^\sa-z]ck
 *              catches "f@ck", "sh!t", "b*tch"
 *
 * Both anchor on \b at the start, which is what keeps "ass" out of "class"
 * and "pass". The trailing lookahead allows up to three suffix letters so
 * "fuck" still matches "fucking" without also matching "assignment".
 *
 * Censoring is restricted to interior positions on terms of 4+ characters:
 * allowing the first or last character to be a wildcard turns short terms
 * into landmines ("as " would match a first-position-wildcard "ass").
 */

const { CATEGORIES, GROUPS, PATTERNS } = require('./lexicon');
const { normalize } = require('./normalize');
const { expandTerm } = require('./variants');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Separator run permitted between two letters of an obfuscated term. */
const GAP = '[^a-z0-9]{0,2}';

/** Up to three trailing letters (ing/ed/s/er) before the word must end. */
const SUFFIX = '(?=[a-z]{0,3}\\b)';

/**
 * compileTerm
 * ───────────
 * Returns a matcher for one lexicon entry.
 *   • Multi-word terms become a whitespace-flexible phrase regex — obfuscating
 *     a whole phrase is rare enough not to be worth the false-positive risk.
 *   • Single words get the gapped + censored treatment described above.
 */
const compileTerm = (term) => {
  const norm = normalize(term).matchText;
  if (!norm) return null;

  if (norm.includes(' ')) {
    const phrase = norm.split(' ').map(escapeRe).join('\\s+');
    return { term, phrase: true, regexes: [new RegExp(`\\b${phrase}`, 'i')] };
  }

  const chars = norm.split('');
  const regexes = [];

  // gapped — tolerates separators and doubled letters between every character
  regexes.push(
    new RegExp(`\\b${chars.map((c) => `${escapeRe(c)}+`).join(GAP)}${SUFFIX}`, 'i'),
  );

  // censored — one interior character replaced by a symbol
  if (chars.length >= 4) {
    for (let i = 1; i < chars.length - 1; i += 1) {
      const body = chars
        .map((c, j) => (j === i ? '[^\\sa-z0-9]' : `${escapeRe(c)}+`))
        .join('');
      regexes.push(new RegExp(`\\b${body}${SUFFIX}`, 'i'));
    }
  }

  return { term, phrase: false, regexes };
};

/**
 * Compiled once at module load. Two structures, because they answer two
 * different questions and a single one would be either slow or wrong:
 *
 *   variantSet – every generated transliteration spelling, as literal strings,
 *                looked up by exact token match. O(1) per token regardless of
 *                how many spellings exist, which is what makes it affordable to
 *                carry ~50 spellings of "chutiya".
 *
 *   matchers   – the gap-tolerant regexes, built from the ORIGINAL terms only.
 *                These handle obfuscation ("l-a-v-d-e", "f@ck"). Building them
 *                for every generated variant too would multiply the regex count
 *                by fifty for no gain: someone who obfuscates is not also
 *                picking an unusual transliteration.
 *
 * Both report the original term, not the variant that matched, so the review
 * queue stays readable.
 */
const COMPILED = GROUPS.map((group) => {
  const variantSet = new Map();   // variant → original term
  const matchers   = [];

  for (const term of group.terms) {
    const compiled = compileTerm(term);
    if (compiled) matchers.push(compiled);

    for (const variant of expandTerm(term)) {
      if (!variantSet.has(variant)) variantSet.set(variant, term);
    }
  }

  return { category: group.category, severity: group.severity, variantSet, matchers };
});

/** Hashtags whose core feature is exchanging contact details. */
const CONTACT_EXPECTED = new Set(['#foodsplit', '#cabsplit', '#resell', '#lost', '#found']);

const countMatches = (text, re) => {
  const m = text.match(re);
  return m ? m.length : 0;
};

/**
 * scanLexicon
 * ───────────
 * matchText carries resolved leet ("sh1t" → "shit"); rawText keeps the
 * original separators the gapped matcher needs to see through. Terms are
 * tested against both.
 */
const scanLexicon = ({ matchText, rawText, tokens }) => {
  const scores = {};
  const hits   = [];
  const seen   = new Set();

  const record = (category, term, severity) => {
    const key = `${category}:${term}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ category, term, severity });
    scores[category] = Math.max(scores[category] || 0, severity);
  };

  for (const group of COMPILED) {
    // Exact-token pass over the generated spellings. This is the pass that
    // catches "saale" and "lawde" from base terms "saala" and "lavde".
    for (const token of tokens) {
      const original = group.variantSet.get(token);
      if (original) record(group.category, original, group.severity);
    }

    // Obfuscation pass over the original terms.
    for (const matcher of group.matchers) {
      if (matcher.regexes.some((re) => re.test(matchText) || re.test(rawText))) {
        record(group.category, matcher.term, group.severity);
      }
    }
  }

  return { scores, hits };
};

/**
 * scanContactInfo
 * ───────────────
 * Doxxing detection that does not break the app.
 *
 * A blanket "no phone numbers" rule would be catastrophic here: #lost, #found,
 * #cabsplit, #foodsplit and #resell all exist so students can reach each other,
 * and the app ships a ContactModal for exactly that. Publishing your OWN number
 * under those tags is the feature working.
 *
 * What is actually doxxing is publishing someone ELSE'S details. The signal for
 * that is contact info appearing next to a mention of another user — so the
 * severity is driven by `hasMentions`, not by the presence of digits.
 */
const scanContactInfo = ({ rawText }, { hashtag, hasMentions }) => {
  const phones = countMatches(rawText, PATTERNS.phone);
  const emails = countMatches(rawText, PATTERNS.email);
  const rooms  = countMatches(rawText, PATTERNS.roomNumber);

  const contactCount = phones + emails + rooms;
  if (contactCount === 0) return { scores: {}, features: { phones, emails, rooms } };

  let severity = 0;
  let reason   = null;

  if (hasMentions) {
    // Someone else's identifier alongside their handle. This is the real case.
    severity = 0.70;
    reason   = 'contact details published alongside a mention of another user';
  } else if (!CONTACT_EXPECTED.has(hashtag)) {
    // A plain post with no exchange purpose has no reason to carry a number.
    severity = 0.35;
    reason   = 'contact details in a post whose hashtag does not involve an exchange';
  }
  // Otherwise: expected and self-published. Not a finding.

  return {
    scores: severity > 0 ? { [CATEGORIES.DOXXING]: severity } : {},
    features: { phones, emails, rooms },
    reason,
  };
};

/**
 * scanSpamShape
 * ─────────────
 * Formatting-level spam signals. Scored low — these justify a review, never a
 * block, because every one of them has an innocent explanation (an excited
 * fresher, a genuine event link, a repeated item name in a listing).
 */
const scanSpamShape = (original, { tokens }) => {
  const letters   = (original.match(/[A-Za-z]/g) || []).length;
  const uppercase = (original.match(/[A-Z]/g) || []).length;
  const capsRatio = letters >= 20 ? uppercase / letters : 0;

  const urls       = countMatches(original.toLowerCase(), PATTERNS.url);
  const shorteners = countMatches(original.toLowerCase(), PATTERNS.shortener);

  const unique       = new Set(tokens).size;
  const repeatRatio  = tokens.length >= 12 ? 1 - unique / tokens.length : 0;

  let severity = 0;
  const reasons = [];

  if (capsRatio > 0.7)   { severity = Math.max(severity, 0.35); reasons.push('mostly uppercase'); }
  if (urls >= 3)         { severity = Math.max(severity, 0.40); reasons.push(`${urls} links`); }
  if (shorteners >= 1)   { severity = Math.max(severity, 0.45); reasons.push('shortened link'); }
  if (repeatRatio > 0.6) { severity = Math.max(severity, 0.35); reasons.push('highly repetitive text'); }

  return {
    scores: severity > 0 ? { [CATEGORIES.SPAM]: severity } : {},
    features: { capsRatio: Number(capsRatio.toFixed(2)), urls, shorteners, repeatRatio: Number(repeatRatio.toFixed(2)) },
    reasons,
  };
};

const mergeScores = (...maps) => {
  const out = {};
  for (const map of maps) {
    for (const [cat, score] of Object.entries(map)) {
      out[cat] = Math.max(out[cat] || 0, score);
    }
  }
  return out;
};

/**
 * runLexical
 * ──────────
 * @param {string} original   The author's text, unmodified.
 * @param {object} normalized Output of normalize().
 * @param {object} context    { hashtag, hasMentions }
 */
const runLexical = (original, normalized, context) => {
  const lex     = scanLexicon(normalized);
  const contact = scanContactInfo(normalized, context);
  const spam    = scanSpamShape(original, normalized);

  return {
    scores: mergeScores(lex.scores, contact.scores, spam.scores),
    hits:   lex.hits,
    features: { ...contact.features, ...spam.features },
    reasons: [
      ...(contact.reason ? [contact.reason] : []),
      ...spam.reasons,
    ],
  };
};

module.exports = { runLexical, CONTACT_EXPECTED };
