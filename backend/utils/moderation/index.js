/**
 * utils/moderation/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Public entry point. One function: moderate(post) → verdict.
 *
 * Tier ladder, cheapest first:
 *
 *   0  normalize   ~0ms    canonicalise so the rules below cannot be trivially evaded
 *   1  lexical     ~1ms    deterministic rules; Hinglish, contact info, scam, spam
 *   2  sentiment   ~1ms    tone and target; disambiguates tier 1's profanity hits
 *   3  classifier ~10ms    pretrained transformer — ALWAYS RUNS. Free, local, offline.
 *   4  semantic  ~500ms    Claude. OPTIONAL, gray band only, off without a key.
 *
 * Tier 3 runs on every post because it is the tier that actually understands
 * English abuse, and at ~10ms there is no reason to gate it. Tier 4 is the only
 * paid component and is skipped entirely unless a credential is configured.
 *
 * The tiers are complements, not a fallback chain. The classifier is blind to
 * romanised Hindi, which is most of the abuse on an Indian campus feed; the
 * lexicon is blind to any insult it has no word for. Removing either leaves a
 * hole that the other does not cover.
 *
 * Deliberately no Express awareness in this file — postController, the update
 * path, comments, and complaints can all reuse it.
 */

const config             = require('./config');
const { normalize }      = require('./normalize');
const { runLexical }     = require('./lexical');
const { analyseSentiment } = require('./sentiment');
const { classifyLocal, warmup } = require('./classifier');
const { classify }       = require('./semantic');
const { decide }         = require('./policy');

/** Version stamp persisted with each verdict, so old decisions stay interpretable. */
const PIPELINE_VERSION = 'cb-mod-2.0';

/**
 * Should the optional paid tier run?
 *
 * Only when the free tiers left the question genuinely open: a combined score
 * inside the gray band, or hostility aimed at a person that nothing else
 * scored. Anything the classifier already resolved confidently is not worth
 * paying for.
 */
const needsSemanticTier = (combinedScores, sentiment, context) => {
  if (!config.llm.enabled) return false;

  const top = Math.max(0, ...Object.values(combinedScores), 0);

  if (top >= config.grayBandLow && top < config.grayBandHigh) return true;
  if (sentiment.isStronglyNegative && (sentiment.targetsPerson || context.hasMentions)) return true;

  return false;
};

/**
 * moderate
 * ────────
 * @param {object} post
 *   title, description, customTags, hashtag – the submitted content
 *   authorRole   – 'Student' | 'Club' | 'Admin'
 *   hasMentions  – whether the post @mentions another user
 *
 * @returns {Promise<object>} verdict from policy.decide(), plus timing.
 *          Never throws: any internal failure resolves to a permissive verdict
 *          so a moderation bug cannot take down post creation.
 */
const moderate = async (post = {}) => {
  const startedAt = Date.now();

  const context = {
    hashtag:     post.hashtag || 'None',
    authorRole:  post.authorRole || 'Student',
    hasMentions: Boolean(post.hasMentions),
  };

  // Roles are configurable but default to all three — a club or an admin
  // account posting a slur is the same problem as a student doing it.
  if (config.mode === 'off' || !config.enforcedRoles.includes(context.authorRole)) {
    return {
      action: 'allow',
      status: 'clean',
      skipped: true,
      reasons: [config.mode === 'off' ? 'moderation disabled' : `role ${context.authorRole} not enforced`],
      scores: {},
      tier: 0,
      pipelineVersion: PIPELINE_VERSION,
      latencyMs: 0,
    };
  }

  try {
    // Title, body and custom tags are judged as one document. Splitting the
    // abuse across the title and the body is otherwise a free bypass.
    const original = [post.title, post.description, ...(post.customTags || [])]
      .filter(Boolean)
      .join('\n');

    const normalized = normalize(original);

    const lexical   = runLexical(original, normalized, context);
    const sentiment = analyseSentiment(normalized.matchText, normalized.tokens);

    // Tier 3 always runs. Two things matter about what it is given:
    //   • the ORIGINAL text, not the normalised form — these models were
    //     trained on natural writing, and punctuation-stripped, de-leeted
    //     text degrades them;
    //   • the fields SEPARATELY, not joined — concatenation measurably
    //     inverts verdicts on this model (see selectSegments in classifier.js).
    const classifier = await classifyLocal([
      post.title,
      post.description,
      (post.customTags || []).join(', '),
    ]);
    let tier = classifier.available ? 3 : 2;

    const combined = { ...lexical.scores };
    for (const [category, value] of Object.entries(classifier.scores || {})) {
      combined[category] = Math.max(combined[category] || 0, value);
    }

    let semantic = null;
    if (needsSemanticTier(combined, sentiment, context)) {
      tier = 4;
      semantic = await classify({
        title:       post.title,
        description: post.description,
        customTags:  post.customTags,
        hashtag:     context.hashtag,
        authorRole:  context.authorRole,
      });
    }

    const verdict = decide({ lexical, sentiment, classifier, semantic, context, tier });

    return {
      ...verdict,
      pipelineVersion: PIPELINE_VERSION,
      mlModel:  classifier.available ? config.ml.primaryModel : null,
      llmModel: semantic?.available ? config.llm.model : null,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    // A crash in the moderator must not become a crash in post creation.
    console.error('[moderation] pipeline error — failing open:', err.message);
    return {
      action: 'allow',
      status: 'flagged',
      primaryCategory: null,
      maxScore: 0,
      scores: {},
      reasons: [`moderation pipeline error: ${err.message} — published and queued for review`],
      tier: 0,
      pipelineVersion: PIPELINE_VERSION,
      latencyMs: Date.now() - startedAt,
    };
  }
};

module.exports = { moderate, warmup, PIPELINE_VERSION };
