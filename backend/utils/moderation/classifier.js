/**
 * utils/moderation/classifier.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 3 — pretrained transformer classifiers, running locally.
 *
 * Free, permanently. The models are downloaded once from Hugging Face and then
 * executed on the CPU through ONNX Runtime inside this Node process. No API
 * key, no per-request cost, no external service in the request path, and no
 * post text ever leaves the server.
 *
 * ── Model choice ────────────────────────────────────────────────────────────
 *
 * PRIMARY: KoalaAI/Text-Moderation (DeBERTa-v3, 9 labels, ~403 MB RSS at q8)
 *   Chosen because its label set is exactly the problem being solved — S/S3
 *   (sexual), SH (self-harm), H/H2 (hate), V/V2 (violence), HR (harassment) —
 *   and because it does not fire on ordinary campus swearing. Measured on this
 *   codebase's test set it scored "that exam was fucking brutal" and "this
 *   hostel wifi is absolute shit" as OK:0.94 and OK:0.96.
 *
 * OPTIONAL: Xenova/toxic-bert (Jigsaw/Detoxify, 6 labels, ~297 MB RSS at q8)
 *   Better recall on direct insults and threats (insult:0.92, threat:0.84
 *   where KoalaAI gives 0.26 and 0.34). Off by default because loading both
 *   measured 522 MB RSS, which does not fit a 512 MB host. Turn it on with
 *   MODERATION_ML_SECONDARY=true when there is 1 GB or more available.
 *
 *   Its `toxic` and `obscene` labels are deliberately mapped to profanity and
 *   nothing else. They score 0.98/0.97 on "that exam was fucking brutal" — the
 *   label conflates swearing with abuse, and treating it as a violation signal
 *   would block exactly the posts this platform exists for.
 *
 * ── What these models cannot do ─────────────────────────────────────────────
 * Both are English-trained and both score romanised Hindi abuse as clean
 * ("tu ek chutiya hai madarchod" → toxic:0.08, OK:0.88). Tier 1's Hinglish
 * lexicon is not redundant with this tier; it is the only thing covering that
 * traffic. Neither model catches implication either ("everyone knows she
 * sleeps around for marks" → toxic:0.09, OK:0.72).
 */

const path   = require('path');
const config = require('./config');
const { CATEGORIES } = require('./lexicon');

/**
 * Score calibration.
 *
 * Raw model outputs are not comparable to the lexicon's severities: KoalaAI
 * emits 0.33–0.73 for clear violations because probability mass is spread over
 * nine labels, whereas the lexicon emits 0.95 for a slur. Feeding raw scores
 * into policy.js would mean the ML tier could never reach blockAt.
 *
 * Each label therefore gets a two-point calibration:
 *   below `trigger`  → 0        (not a finding)
 *   at    `trigger`  → 0.45     (flagAt — a human should look)
 *   at    `ceiling`  → 0.95     (blockAt and above — act on it)
 * with linear interpolation between and a clamp above.
 *
 * ── How these numbers were derived ──────────────────────────────────────────
 * Measured over a 33-post labelled set (17 must-publish, 13 must-block, 3
 * self-harm) covering ordinary campus life, angry-but-legitimate criticism,
 * discussion ABOUT sensitive topics, and real violations of each category.
 * Observed maxima:
 *
 *   label   clean max   violation range
 *   H         0.019       0.23 – 0.69
 *   H2        0.005       0.00 – 0.135
 *   HR        0.014       0.09 – 0.34
 *   S         0.006       0.43 – 0.73
 *   S3        0.004       0.00 – 0.20
 *   SH        0.101       0.34 – 0.51
 *   V         0.023       0.33 – 0.42
 *   V2        0.012       0.00 – 0.059
 *
 * A trigger has to clear TWO floors, and missing either one breaks it:
 *
 *   1. The clean maximum. An earlier version guessed triggers at 0.18-0.25 and
 *      let real hate speech land at 0.776 — inside the flag band, just under
 *      blockAt, so it published.
 *
 *   2. The INCIDENTAL maximum: what a label scores on posts that violate some
 *      OTHER category. A self-harm post carries V:0.128 and H:0.140 without
 *      being violent or hateful. Setting V's trigger from the clean maximum
 *      alone (0.023) made every self-harm post register violence_threat:0.57.
 *      Probability mass is spread across nine labels, so neighbouring labels
 *      always catch some — triggers must sit above that spill.
 *
 * SH is a further exception: its clean maximum is 0.101 because mild
 * frustration ("I hate this weather" → SH:0.10) reads as low-grade distress.
 *
 * Re-derive these against your own traffic before trusting them at scale;
 * 33 posts establishes the shape, not the exact optimum.
 */
const KOALA_LABELS = {
  S:  { category: CATEGORIES.SEXUAL,    trigger: 0.12, ceiling: 0.40 },
  S3: { category: CATEGORIES.SEXUAL,    trigger: 0.06, ceiling: 0.15 }, // sexual/minors — far lower bar
  SH: { category: CATEGORIES.SELF_HARM, trigger: 0.15, ceiling: 0.32 },
  H:  { category: CATEGORIES.HATE,      trigger: 0.17, ceiling: 0.25 },
  H2: { category: CATEGORIES.HATE,      trigger: 0.07, ceiling: 0.13 }, // hate + threatening
  V:  { category: CATEGORIES.VIOLENCE,  trigger: 0.22, ceiling: 0.35 },
  V2: { category: CATEGORIES.VIOLENCE,  trigger: 0.08, ceiling: 0.15 }, // graphic violence
  HR: { category: CATEGORIES.HARASSMENT,trigger: 0.13, ceiling: 0.28 },
};

const TOXIC_BERT_LABELS = {
  insult:        { category: CATEGORIES.HARASSMENT, trigger: 0.50, ceiling: 0.90 },
  identity_hate: { category: CATEGORIES.HATE,       trigger: 0.30, ceiling: 0.70 },
  threat:        { category: CATEGORIES.VIOLENCE,   trigger: 0.30, ceiling: 0.80 },
  severe_toxic:  { category: CATEGORIES.HARASSMENT, trigger: 0.30, ceiling: 0.70 },
  // Swearing only. Capped below flagAt so it can never drive an action on its
  // own — the same rule the lexicon's profanity group follows.
  obscene:       { category: CATEGORIES.PROFANITY,  trigger: 0.70, ceiling: 0.95, cap: 0.30 },
  toxic:         { category: CATEGORIES.PROFANITY,  trigger: 0.80, ceiling: 0.98, cap: 0.30 },
};

const calibrate = (raw, { trigger, ceiling, cap }) => {
  if (raw < trigger) return 0;
  const span   = Math.max(ceiling - trigger, 1e-6);
  const scaled = 0.45 + ((raw - trigger) / span) * 0.5;
  return Math.min(cap ?? 1, Number(Math.min(scaled, 1).toFixed(3)));
};

/**
 * The model's own "this is fine" head. When it is confident, damp everything
 * else — this is the guard that keeps profane-but-legitimate complaints out of
 * the review queue, and it is why the queue stays small enough to be read.
 */
const OK_SUPPRESSION_AT = 0.85;

/**
 * Confusion guard.
 *
 * A real violation lights up ONE category, occasionally two related ones
 * (hate + harassment, violence + hate). When three or more distinct categories
 * cross their triggers at once, the model is not telling you the post is
 * sexual AND hateful AND violent — it is telling you it has no idea, and the
 * probability mass has spread out.
 *
 * Measured: the title "Admin useless" — two words, entirely benign — returns
 * OK:0.12 with H, S, V, H2 and SH all clustered around 0.11-0.23, and would
 * otherwise have blocked a complaint about the administration at 0.823. Longer
 * benign fragments do not do this ("Wifi rant" and "This sucks" both return
 * OK:0.97), so this is about confidence, not length.
 *
 * Such a verdict is damped into the flag band rather than discarded: a human
 * still sees it, but it cannot block a post on its own.
 */
const CONFUSION_CATEGORY_COUNT = 3;
const CONFUSION_DAMPING        = 0.65;

// ── Lazy singleton loading ──────────────────────────────────────────────────
// A single in-flight promise, so N concurrent posts on a cold process trigger
// one load rather than N. Failure is remembered, not retried per request.
let loadPromise = null;
let models      = null;
let loadError   = null;

const loadModels = async () => {
  // ESM-only package; require() would throw in this CommonJS codebase.
  const { pipeline, env } = await import('@huggingface/transformers');

  // Keep weights inside the project so a redeploy does not re-download 150 MB
  // into a container temp dir that is wiped on every restart.
  env.cacheDir = config.ml.cacheDir;
  env.allowLocalModels = true;

  const loaded = {};
  const started = Date.now();

  loaded.primary = await pipeline('text-classification', config.ml.primaryModel, {
    dtype: config.ml.dtype,
  });

  if (config.ml.useSecondary) {
    loaded.secondary = await pipeline('text-classification', config.ml.secondaryModel, {
      dtype: config.ml.dtype,
    });
  }

  console.log(
    `[moderation] ML models ready in ${Date.now() - started}ms ` +
    `(${config.ml.primaryModel}${config.ml.useSecondary ? ` + ${config.ml.secondaryModel}` : ''}, ` +
    `dtype=${config.ml.dtype}, rss=${Math.round(process.memoryUsage().rss / 1048576)}MB)`,
  );

  return loaded;
};

/**
 * warmup
 * ──────
 * Call once at server boot. The first load downloads the weights (~150 MB) and
 * takes tens of seconds; without this the first student to post pays that cost
 * and probably times out. Safe to call more than once.
 */
const warmup = async () => {
  if (!config.ml.enabled) return { ok: false, reason: 'ML tier disabled' };
  if (models)    return { ok: true, cached: true };
  if (loadError) return { ok: false, reason: loadError };

  if (!loadPromise) {
    loadPromise = loadModels()
      .then((m) => { models = m; return m; })
      .catch((err) => {
        loadError = err.message;
        console.error('[moderation] ML models failed to load — pipeline continues without them:', err.message);
        return null;
      });
  }

  await loadPromise;
  return models ? { ok: true } : { ok: false, reason: loadError };
};

/** BERT-family inputs cap at 512 tokens; keep well inside it. */
const MAX_CHARS = 1500;

const runModel = async (clf, text, labelMap) => {
  const output = await clf(text, { top_k: null });
  const raw    = Object.fromEntries(output.map((o) => [o.label, Number(o.score.toFixed(4))]));

  const okScore = raw.OK || 0;
  const scores  = {};

  for (const [label, spec] of Object.entries(labelMap)) {
    const value = calibrate(raw[label] || 0, spec);
    if (value > 0) scores[spec.category] = Math.max(scores[spec.category] || 0, value);
  }

  // Damp when the model is confident the post is fine. Applied only to
  // enforcement categories — self-harm is never suppressed, because a post
  // that reads as ordinary on the surface is exactly how distress presents.
  if (okScore >= OK_SUPPRESSION_AT) {
    for (const category of Object.keys(scores)) {
      if (category !== CATEGORIES.SELF_HARM) scores[category] *= 0.5;
    }
  }

  // Confusion guard — see CONFUSION_CATEGORY_COUNT above.
  const confused = Object.keys(scores).length >= CONFUSION_CATEGORY_COUNT;
  if (confused) {
    for (const category of Object.keys(scores)) scores[category] *= CONFUSION_DAMPING;
  }

  return { scores, raw, confused };
};

/**
 * Picks the text segments to classify.
 *
 * These models were trained on single coherent comments, and concatenating
 * fields pushes the input off-distribution badly enough to invert the verdict:
 * "white race is a bad race" scores H:0.692, but the same sentence joined to a
 * near-identical title scores OK:0.988. Joining title and description was
 * silently disarming the whole tier.
 *
 * So each field is classified on its own and the per-label maximum is taken.
 * That also keeps the title/body split bypass covered — each half is judged in
 * full — at the cost of one extra forward pass (~8ms).
 *
 * Segments that merely repeat another are dropped rather than re-run.
 */
const selectSegments = (input) => {
  const parts = Array.isArray(input)
    ? input
    : [input];

  const segments = [];
  for (const part of parts) {
    const text = (part || '').trim().slice(0, MAX_CHARS);
    if (!text) continue;
    // Skip anything already contained in a segment we are going to classify.
    if (segments.some((s) => s.includes(text) || text.includes(s))) {
      // Keep the longer of the two.
      const idx = segments.findIndex((s) => s.includes(text) || text.includes(s));
      if (text.length > segments[idx].length) segments[idx] = text;
      continue;
    }
    segments.push(text);
  }
  return segments;
};

/**
 * classifyLocal
 * ─────────────
 * @param {string|string[]} input One text, or the post's fields as separate
 *        strings. Passing them separately is strongly preferred — see
 *        selectSegments above for why concatenation breaks these models.
 * @returns {Promise<{available: boolean, scores?: object, raw?: object, error?: string, latencyMs: number}>}
 *          `available: false` means the tier could not run — treat as unknown,
 *          never as clean. Never throws.
 */
const classifyLocal = async (input) => {
  const startedAt = Date.now();

  if (!config.ml.enabled) {
    return { available: false, error: 'ML tier disabled', latencyMs: 0 };
  }

  try {
    await warmup();
    if (!models) {
      return { available: false, error: loadError || 'models unavailable', latencyMs: Date.now() - startedAt };
    }

    const segments = selectSegments(input);
    if (!segments.length) {
      return { available: true, scores: {}, raw: {}, latencyMs: Date.now() - startedAt };
    }

    const scores = {};
    const raw    = { primary: {}, secondary: models.secondary ? {} : undefined };
    let confused = false;

    for (const segment of segments) {
      const primary = await runModel(models.primary, segment, KOALA_LABELS);
      confused = confused || primary.confused;
      for (const [label, value] of Object.entries(primary.raw)) {
        raw.primary[label] = Math.max(raw.primary[label] || 0, value);
      }
      for (const [category, value] of Object.entries(primary.scores)) {
        scores[category] = Math.max(scores[category] || 0, value);
      }

      if (models.secondary) {
        const secondary = await runModel(models.secondary, segment, TOXIC_BERT_LABELS);
        for (const [label, value] of Object.entries(secondary.raw)) {
          raw.secondary[label] = Math.max(raw.secondary[label] || 0, value);
        }
        for (const [category, value] of Object.entries(secondary.scores)) {
          scores[category] = Math.max(scores[category] || 0, value);
        }
      }
    }

    return {
      available: true,
      scores: Object.fromEntries(
        Object.entries(scores).map(([k, v]) => [k, Number(v.toFixed(3))]),
      ),
      raw,
      confused,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    // Fail open, like every other tier.
    return { available: false, error: err.message, latencyMs: Date.now() - startedAt };
  }
};

module.exports = { classifyLocal, warmup, KOALA_LABELS, TOXIC_BERT_LABELS, calibrate };
