/**
 * utils/moderation/variants.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Transliteration variant generation for the Hinglish lexicon.
 *
 * Romanised Hindi has no standard orthography. The same word is written
 * lavde / lawde / laude / lavda, or saala / saale / sala, or chutiya /
 * chutiye / chutia, and a student picks whichever spelling they type fastest.
 * A list with one spelling per term catches one of those and misses the rest —
 * which is exactly how "chutiya" blocked while "saale" and "lawde" published.
 *
 * So the spellings are GENERATED from a defined set of transliteration
 * equivalences rather than hand-listed. Generation happens once at module load
 * and produces literal strings, not wildcards: every variant is still an exact
 * term the matcher tests, so this adds coverage without the false-positive
 * risk that fuzzy or edit-distance matching would carry.
 *
 * ── Why the collision guard is not optional ─────────────────────────────────
 * Expanding "saala" by trailing-vowel substitution produces "sale". This app's
 * #resell feed is full of the word "sale". Any generated form colliding with an
 * ordinary English or campus word is discarded — see COLLISIONS.
 */

/**
 * Consonant equivalences, applied one substitution at a time in both
 * directions so output stays a plausible spelling rather than a scramble.
 */
const CONSONANT_SWAPS = [
  ['v', 'w'],   // lavde  ↔ lawde
  ['j', 'z'],   // jhaant ↔ zhaant
  ['ph', 'f'],
  ['bh', 'b'],
  ['dh', 'd'],
  ['th', 't'],
  ['kh', 'k'],
  ['gh', 'g'],
];

/** Long/short vowel equivalences: aa↔a, ee↔i, oo↔u. */
const VOWEL_SWAPS = [
  ['aa', 'a'], ['ee', 'i'], ['ii', 'i'], ['oo', 'u'], ['uu', 'u'],
];

/**
 * Hindi nouns inflect for case and gender and the ending is what moves:
 * lavda / lavde / lavdi, saala / saale, chutiya / chutiye. Applied to the
 * final character only, and only when it is already a vowel.
 */
const TRAILING_VOWELS = ['a', 'e', 'i', 'o'];

/**
 * Generated forms that collide with ordinary words. Any variant landing here is
 * dropped. Blocking a #resell post for containing "sale" would be a far worse
 * failure than missing one spelling of a mild insult.
 *
 * Extend this if a generated variant ever causes a false positive — cheaper and
 * safer than removing the source term.
 */
const COLLISIONS = new Set([
  'sale', 'sales', 'sala', 'salo', 'sali', 'salu',
  'male', 'mile', 'mila', 'milo', 'tale', 'tile', 'tala',
  'note', 'nota', 'cute', 'cuta', 'cuti', 'kite', 'kata', 'kati',
  'late', 'lade', 'lado', 'ladi', 'lada', 'code', 'coda',
  'bade', 'bada', 'badi', 'made', 'mode', 'moda',
  'gate', 'gata', 'date', 'data', 'rate', 'rata', 'rati',
  'game', 'come', 'came', 'lane', 'line', 'cane', 'cone',
  'core', 'care', 'hare', 'here', 'hire', 'hera',
  'chai', 'chia', 'gora', 'gori', 'gande', 'ganda',
  'seat', 'seats', 'sheet', 'share', 'shore',
]);

/** Terms shorter than this are not expanded — too few characters to stay distinct. */
const MIN_LENGTH_FOR_EXPANSION = 5;

/** Generated variants below this length are discarded regardless. */
const MIN_VARIANT_LENGTH = 5;

const applyOnce = (word, from, to) => {
  const out = [];
  let idx = word.indexOf(from);
  while (idx !== -1) {
    out.push(word.slice(0, idx) + to + word.slice(idx + from.length));
    idx = word.indexOf(from, idx + 1);
  }
  return out;
};

/**
 * expandTerm
 * ──────────
 * @param   {string} term A single word. Multi-word phrases are returned as-is —
 *                        expanding every word of a phrase multiplies out far
 *                        too far for no benefit.
 * @returns {string[]}    The term plus its generated spellings, collisions removed.
 */
const expandTerm = (term) => {
  const base = (term || '').toLowerCase().trim();
  if (!base || base.includes(' ') || base.length < MIN_LENGTH_FOR_EXPANSION) return base ? [base] : [];

  const seen  = new Set([base]);
  let frontier = [base];

  // Two passes, one substitution each — enough to reach lavde → lawda
  // (v→w, then trailing e→a) without combinatorial blow-up.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = [];

    for (const word of frontier) {
      const candidates = [];

      for (const [a, b] of [...CONSONANT_SWAPS, ...VOWEL_SWAPS]) {
        candidates.push(...applyOnce(word, a, b), ...applyOnce(word, b, a));
      }

      const last = word[word.length - 1];
      if (TRAILING_VOWELS.includes(last)) {
        for (const v of TRAILING_VOWELS) {
          if (v !== last) candidates.push(`${word.slice(0, -1)}${v}`);
        }
      }

      for (const candidate of candidates) {
        if (candidate.length < MIN_VARIANT_LENGTH) continue;
        if (seen.has(candidate) || COLLISIONS.has(candidate)) continue;
        seen.add(candidate);
        next.push(candidate);
      }
    }

    frontier = next;
  }

  return [...seen].filter((w) => !COLLISIONS.has(w));
};

/** Expands a whole term list, de-duplicated. */
const expandTerms = (terms) => {
  const out = new Set();
  for (const term of terms) for (const v of expandTerm(term)) out.add(v);
  return [...out];
};

module.exports = { expandTerm, expandTerms, COLLISIONS };
