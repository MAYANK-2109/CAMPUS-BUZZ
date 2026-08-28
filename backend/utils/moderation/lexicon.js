/**
 * utils/moderation/lexicon.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Term lists for the deterministic (Tier 1) pass.
 *
 * Scope note: this tier is intentionally NARROW. It exists to catch the
 * unambiguous cases in under a millisecond and to feed features to the policy
 * layer — it is not trying to understand anything. Sarcasm, coded harassment,
 * targeted bullying that uses no bad words at all, and scam intent dressed up
 * as a normal listing are all invisible here and are the LLM tier's job.
 *
 * Two things this list does that a stock npm profanity filter does not:
 *
 *   • Romanised Hindi / Hinglish. This is a NIT Raipur deployment. Abuse on
 *     an Indian campus feed is overwhelmingly typed in Latin-script Hindi, and
 *     an English-only list scores it a clean 0.0.
 *
 *   • Severity tiers rather than a flat blocklist. "damn" and a casteist slur
 *     are not the same event and must not produce the same action.
 *
 * `severity` is the score contributed to its category, in [0, 1]. Compare
 * against config.blockAt / config.flagAt to reason about what each tier does.
 *
 * Maintenance: these lists are meant to be edited by whoever runs the campus
 * instance. Prefer adding to the LLM tier's policy prompt over growing this
 * file — every term added here is a term someone must also spell correctly.
 */

// ── Category identifiers, shared with the LLM tier and the Post schema ───────
const CATEGORIES = {
  HARASSMENT: 'harassment',
  HATE:       'hate_speech',
  SEXUAL:     'sexual',
  VIOLENCE:   'violence_threat',
  SELF_HARM:  'self_harm',
  SCAM:       'scam_fraud',
  DOXXING:    'doxxing',
  SPAM:       'spam',
  PROFANITY:  'profanity',
};

/**
 * Groups are evaluated independently; a post can hit several. Each group's
 * severity is contributed to its category and the maximum per category wins.
 */
const GROUPS = [
  // ── Slurs and identity-based attacks ──────────────────────────────────────
  // Highest severity in the file. On an Indian campus the casteist and
  // communal terms matter at least as much as the English racial slurs, and
  // no imported wordlist contains them.
  {
    category: CATEGORIES.HATE,
    severity: 0.95,
    terms: [
      // Caste-based
      'chamar', 'bhangi', 'chuhra', 'neech jaat', 'lower caste scum',
      'sc st quota chor', 'quota chor', 'reservation chor',
      // Communal / religious
      'katua', 'mulla bhag', 'jihadi kutta', 'landya',
      'go back to pakistan', 'pakistani agent',
      // Regional / ethnic
      'chinki', 'madrasi kutta', 'bihari kutta', 'bhaiya scum',
      // English racial / ethnic slurs
      'nigger', 'nigga', 'chink', 'paki', 'raghead', 'towelhead',
      // Orientation / gender identity
      'faggot', 'fag', 'tranny', 'dyke', 'hijra saala',
      // Ableist
      'retard', 'retarded', 'spastic',
    ],
  },

  // ── Direct threats of violence ────────────────────────────────────────────
  {
    category: CATEGORIES.VIOLENCE,
    severity: 0.90,
    terms: [
      'i will kill you', 'ill kill you', 'kill you', 'murder you',
      'beat you to death', 'break your legs', 'break your bones',
      'jaan se maar dunga', 'jaan se marunga', 'tujhe maar dunga',
      'tumhe maar dunga', 'haath pair tod dunga', 'tod dunga',
      'wait outside hostel', 'catch you alone', 'find you and',
      'acid attack', 'stab you', 'burn your',
    ],
  },

  // ── Self-harm and suicidal ideation ───────────────────────────────────────
  // NOTE: this category must NEVER produce a block. See policy.js — it routes
  // to a support response instead. Blocking someone reaching out is the single
  // worst outcome this pipeline can produce.
  {
    category: CATEGORIES.SELF_HARM,
    severity: 0.85,
    terms: [
      'kill myself', 'killing myself', 'end my life', 'ending my life',
      'want to die', 'wanna die', 'better off dead', 'no reason to live',
      'suicide', 'suicidal', 'hang myself', 'hanging myself',
      // Inflected variants matter: phrase matching is exact, so "jumping off
      // the hostel roof" does not match "jump off the roof".
      'jump from hostel', 'jump off the roof', 'jump off the hostel',
      'jumping off', 'jumping from', 'hostel roof',
      'cut myself', 'cutting myself', 'harm myself', 'hurt myself',
      'overdose on', 'take all the pills',
      'marna chahta hun', 'marna chahti hun', 'jeena nahi chahta',
      'jeene ka mann nahi', 'khatam kar dunga apne aap ko',
    ],
  },

  // ── Sexual content and sexual harassment ──────────────────────────────────
  {
    category: CATEGORIES.SEXUAL,
    severity: 0.80,
    terms: [
      'send nudes', 'nude pics', 'nudes', 'sex chat', 'sexting',
      'rape', 'raped', 'molest', 'grope',
      'show me your body', 'strip for me', 'sleep with me for',
      'randi', 'randi rona', 'chinal', 'rakhail',
      'boobs', 'tits', 'dick pic', 'blowjob', 'porn', 'pornhub',
    ],
  },

  // ── Severe personal abuse ─────────────────────────────────────────────────
  // Scored high enough to block on its own, and it has to be: the transformer
  // in tier 3 is English-trained and scores this entire list as clean
  // (measured: "tu ek chutiya hai madarchod" → OK:0.88, toxic:0.08). For
  // romanised Hindi abuse — which is most of the abuse on this campus — the
  // lexicon is not a cheap pre-filter, it is the only detector there is.
  {
    category: CATEGORIES.HARASSMENT,
    severity: 0.85,
    terms: [
      // Hinglish. Spelling variants are GENERATED — see variants.js. Listing
      // one spelling per term is what let "saale" and "lawde" through while
      // "chutiya" blocked.
      'madarchod', 'behenchod', 'bhenchod', 'bhosdike', 'bhosadike',
      'bhosda', 'lavde', 'lauda', 'lodu', 'chutiya', 'chutiye', 'chutmarike',
      'gandu', 'gaandu', 'gaand mara', 'gandmasti', 'haramkhor',
      'kutte ki aulad', 'saala kutta', 'kutti', 'kutiya',
      'bhadwa', 'bhadve', 'bakchod', 'bakchodi', 'chodu', 'chinal',
      'jhatu', 'jhaant', 'tatti', 'chomu', 'gaandfat',
      'teri maa', 'teri behen', 'maa ki', 'behen ki', 'maa chuda',
      // 'saala' / 'saale' is included at this severity because it was
      // explicitly requested. Note the trade-off: it is also common friendly
      // banter ("arre saale kahan tha"), so expect some false positives among
      // friends. Moving it to the milder group below turns those into review
      // items instead of blocks.
      'saala', 'saale',
      // English
      'motherfucker', 'son of a bitch', 'cunt', 'whore', 'slut',
    ],
  },

  // ── Milder personal abuse and put-downs ───────────────────────────────────
  // Flag-tier. These are genuinely ambiguous between banter and bullying, and
  // that call needs the context tier 3 and the sentiment tier provide — the
  // word alone does not settle it.
  {
    category: CATEGORIES.HARASSMENT,
    severity: 0.55,
    terms: [
      'harami', 'kamine', 'kaminey',
      'bastard', 'asshole', 'bitch', 'douchebag', 'scumbag',
      'nobody likes you', 'everyone hates you', 'you should quit college',
      'you are worthless', 'youre worthless', 'you are a joke',
      'go die', 'just leave campus',
    ],
  },

  // ── General profanity ─────────────────────────────────────────────────────
  // Low severity on purpose. Students swear. This alone should never block a
  // post; it only matters when it combines with negative sentiment aimed at a
  // named person — that combination is what policy.js looks for.
  {
    category: CATEGORIES.PROFANITY,
    severity: 0.25,
    terms: [
      'fuck', 'fucking', 'fucked', 'shit', 'bullshit', 'crap', 'damn',
      'piss off', 'dumbass', 'jackass', 'bloody hell',
      'bakwas', 'bewakoof', 'pagal', 'nikamma', 'ghatiya',
    ],
  },

  // ── Scam and fraud ────────────────────────────────────────────────────────
  // Aimed at #resell. A campus marketplace is a soft target: everyone trusts
  // an institute email address, which is exactly what makes the scam work.
  {
    category: CATEGORIES.SCAM,
    severity: 0.65,
    terms: [
      'pay advance', 'advance payment only', 'pay first then',
      'send money first', 'upi first', 'gpay first', 'pay before meeting',
      'no meeting required', 'cannot meet in person', 'shipping only',
      'double your money', 'guaranteed returns', 'earn from home',
      'work from home earn', 'crypto investment', 'bitcoin doubling',
      'lottery winner', 'you have won', 'claim your prize',
      'click this link to claim', 'limited time offer act now',
      'part time job daily payout', 'no investment daily income',
      'telegram me for details', 'dm on telegram',
      'exam paper leak', 'question paper leak', 'answer key selling',
      'fake certificate', 'fake marksheet', 'assignment writing service',
    ],
  },
];

/**
 * Regex-based detectors that do not fit a term list.
 * These are checked against `rawText` (separators intact) rather than
 * `matchText`, because the formatting is the signal.
 */
const PATTERNS = {
  /** Indian mobile numbers: optional +91/0 prefix, then a 10-digit number starting 6–9. */
  phone: /(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}\b/g,

  email: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g,

  /** URL shorteners — the usual vehicle for a link you can't inspect first. */
  shortener: /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|rebrand\.ly)\b/g,

  url: /\bhttps?:\/\/\S+|\bwww\.\S+/g,

  /** Hostel room / quarters identifiers — doxxing signal when paired with a name. */
  roomNumber: /\b(?:room|hostel|block|quarters?)\s*(?:no\.?|number|#)?\s*[a-z]?-?\d{1,4}\b/g,
};

module.exports = { CATEGORIES, GROUPS, PATTERNS };
