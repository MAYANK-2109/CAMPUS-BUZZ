/**
 * utils/moderation/config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Every tunable knob for the moderation pipeline, resolved once at import time.
 *
 * Thresholds are deliberately env-driven: the right cut-off for a campus feed
 * can only be found by watching real traffic, and re-tuning must not require a
 * code change. Start in shadow mode (MODERATION_MODE=shadow), read the logged
 * scores for a week or two, then move to enforce with numbers you can defend.
 */

const num  = (v, fallback) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
const bool = (v, fallback) => (v === undefined || v === '' ? fallback : /^(1|true|yes|on)$/i.test(v));
const list = (v, fallback) => (v === undefined || v === '' ? fallback : v.split(',').map(s => s.trim()).filter(Boolean));

const config = {
  /**
   * 'enforce' – blocked posts are rejected with 422.
   * 'shadow'  – nothing is ever blocked; verdicts are still computed, stored
   *             and logged so thresholds can be tuned against real traffic.
   * 'off'     – pipeline is skipped entirely.
   *
   * The code default is 'enforce' so the feature works when the variable is
   * absent; .env.example ships 'shadow' because that is the right way to bring
   * it up on a live campus feed.
   */
  mode: (process.env.MODERATION_MODE || 'enforce').toLowerCase(),

  /** Roles whose posts run through the pipeline. All three by default. */
  enforcedRoles: list(process.env.MODERATION_ROLES, ['Student', 'Club', 'Admin']),

  /**
   * Score bands. Every tier emits per-category scores in [0, 1] and the policy
   * layer takes the highest.
   *   >= blockAt  → reject the post
   *   >= flagAt   → publish, but open a review case and ping Admins
   *   in the gray band → escalate to the LLM tier for a real judgement call
   */
  blockAt: num(process.env.MODERATION_BLOCK_AT, 0.80),
  flagAt:  num(process.env.MODERATION_FLAG_AT,  0.45),

  grayBandLow:  num(process.env.MODERATION_GRAY_LOW,  0.30),
  grayBandHigh: num(process.env.MODERATION_GRAY_HIGH, 0.85),

  /**
   * Sentiment gate. The AFINN comparative score is a per-word average in
   * roughly [-5, 5]; anything at or below this is "strongly negative" and
   * becomes a signal the policy layer can combine with lexical hits.
   */
  sentimentNegativeAt: num(process.env.MODERATION_SENTIMENT_AT, -0.6),

  /** Minimum token count before sentiment is trusted — three angry words is noise. */
  sentimentMinTokens: num(process.env.MODERATION_SENTIMENT_MIN_TOKENS, 4),

  /**
   * Tier 3 — pretrained transformer classifiers running locally via ONNX.
   * Free and offline after the first download. This is the primary ML engine.
   */
  ml: {
    enabled: bool(process.env.MODERATION_ML_ENABLED, true),

    /** Covers sexual, self-harm, hate, violence and harassment. ~403 MB RSS at q8. */
    primaryModel: process.env.MODERATION_ML_MODEL || 'KoalaAI/Text-Moderation',

    /**
     * Second opinion with better insult/threat recall. Off by default: both
     * models together measured 522 MB RSS, over a 512 MB host. Enable only
     * where there is 1 GB or more.
     */
    useSecondary:   bool(process.env.MODERATION_ML_SECONDARY, false),
    secondaryModel: process.env.MODERATION_ML_SECONDARY_MODEL || 'Xenova/toxic-bert',

    /**
     * q8 measured best: q4 was both less accurate on borderline posts and
     * larger at runtime (805 MB), because 4-bit blocks dequantize in memory.
     */
    dtype: process.env.MODERATION_ML_DTYPE || 'q8',

    /** Weights live in the repo so a restart does not re-download them. */
    cacheDir: process.env.MODERATION_ML_CACHE || require('path').join(__dirname, '..', '..', '.models'),

    /** Load the models at server boot rather than on the first post. */
    warmupOnBoot: bool(process.env.MODERATION_ML_WARMUP, true),
  },

  /**
   * Tier 4 — Claude. OPTIONAL and OFF unless an Anthropic credential exists.
   * This is the only paid component; everything above it is free. It earns its
   * place on the cases the local models miss — romanised Hindi abuse, sarcasm,
   * and harassment by implication — but the pipeline is fully functional
   * without it.
   */
  llm: {
    enabled: bool(process.env.MODERATION_LLM_ENABLED, true),
    /**
     * Without a credential the tier disables itself and the pipeline runs
     * lexical + sentiment only. Both env mechanisms the SDK understands are
     * accepted; when only ANTHROPIC_AUTH_TOKEN is set the key is left blank and
     * the SDK resolves it from the environment itself.
     */
    apiKey:  process.env.ANTHROPIC_API_KEY || '',
    hasCredential: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    model:   process.env.MODERATION_LLM_MODEL || 'claude-opus-5',
    /** Hard ceiling. On timeout we fail open to 'flagged' rather than block. */
    timeoutMs: num(process.env.MODERATION_LLM_TIMEOUT_MS, 6000),
    maxTokens: num(process.env.MODERATION_LLM_MAX_TOKENS, 2048),
  },

  /** Log every verdict, not just the actioned ones. Needed to tune thresholds. */
  logAllVerdicts: bool(process.env.MODERATION_LOG_ALL, false),
};

config.llm.enabled = config.llm.enabled && config.llm.hasCredential;

module.exports = config;
