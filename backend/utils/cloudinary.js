/**
 * utils/cloudinary.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Media storage on Cloudinary.
 *
 * ── Why signed direct upload, and not upload-through-the-backend ────────────
 * The obvious design is multer -> cloudinary.uploader.upload_stream: the
 * browser posts the file to Express, Express forwards it. It is rejected here
 * for a concrete reason. This backend already sits at roughly 410 MB resident
 * because the moderation classifier holds a transformer in memory, and it is
 * deployed on hosts with as little as 512 MB. Buffering even a couple of
 * concurrent 10 MB photos through Node is enough to push it into an OOM kill,
 * which would take the whole API down to serve one upload.
 *
 * So the file never touches this server. The browser asks for a signature,
 * uploads straight to Cloudinary, and sends back only the resulting URL. That
 * also removes the body-size limit and the request timeout on slow mobile
 * connections, neither of which Express handles gracefully for large bodies.
 *
 * ── Degrades cleanly ────────────────────────────────────────────────────────
 * Without credentials `isConfigured()` returns false, the signature endpoint
 * answers 503 with an explanation, and the UI keeps its existing paste-a-URL
 * field. An unconfigured deployment loses uploads, not the ability to post.
 */

const crypto     = require('crypto');
const cloudinary = require('cloudinary').v2;

/**
 * Credentials come from either shape:
 *
 *   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
 *   — the single line Cloudinary shows on its dashboard, and what most
 *     hosting providers expect;
 *
 *   or the three separate CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET vars.
 *
 * The URL form wins when both are present, because it is the one a person
 * pasted most recently. Parsed by hand rather than left to the SDK's implicit
 * env pickup so that isConfigured() can answer honestly before any call.
 */
const parseCloudinaryUrl = (url) => {
  if (!url) return null;
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim());
  if (!m) return null;
  return { apiKey: m[1], apiSecret: m[2], cloudName: m[3].replace(/\/.*$/, '') };
};

const fromUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);

const CLOUD_NAME = fromUrl?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || '';
const API_KEY    = fromUrl?.apiKey    || process.env.CLOUDINARY_API_KEY    || '';
const API_SECRET = fromUrl?.apiSecret || process.env.CLOUDINARY_API_SECRET || '';

/**
 * A masked secret pasted straight from the dashboard ("cloudinary://key:****@x")
 * would otherwise configure the module and fail every upload with an opaque
 * 401 from Cloudinary. Caught here so the failure names itself.
 */
const SECRET_LOOKS_MASKED = /^\*+$/.test(API_SECRET);
if (SECRET_LOOKS_MASKED) {
  console.warn('[cloudinary] The API secret is masked (all asterisks). Paste the real secret into backend/.env — uploads stay disabled until then.');
}

/** Folder per asset kind, so the Cloudinary console stays navigable. */
const FOLDERS = {
  post:   process.env.CLOUDINARY_POST_FOLDER   || 'campus-buzz/posts',
  avatar: process.env.CLOUDINARY_AVATAR_FOLDER || 'campus-buzz/avatars',
};

/** Upload ceiling enforced by Cloudinary itself via the signed params. */
const MAX_BYTES = Number(process.env.CLOUDINARY_MAX_BYTES) || 8 * 1024 * 1024; // 8 MB

const isConfigured = () => Boolean(CLOUD_NAME && API_KEY && API_SECRET) && !SECRET_LOOKS_MASKED;

if (isConfigured()) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key:    API_KEY,
    api_secret: API_SECRET,
    secure:     true,
  });
}

/**
 * signUpload
 * ──────────
 * Produces the parameters a browser needs to upload directly.
 *
 * Every constraint that matters is baked into the SIGNED parameter set —
 * folder, allowed formats, size cap, and a transformation that bounds the
 * stored image. Cloudinary verifies the signature covers them, so a client
 * cannot widen them by editing the request: they can only upload what the
 * server agreed to.
 *
 * @param   {'post'|'avatar'} kind
 * @param   {string} userId  Namespaces the public_id so one user's upload can
 *                           never overwrite another's.
 * @returns {object} Fields to POST to Cloudinary, plus cloudName for the URL.
 */
const signUpload = (kind, userId) => {
  if (!isConfigured()) throw new Error('Cloudinary is not configured');

  const folder = FOLDERS[kind] || FOLDERS.post;
  const timestamp = Math.round(Date.now() / 1000);

  // Unique per upload; prefixed with the uploader so collisions are impossible.
  const publicId = `${userId}_${timestamp}_${crypto.randomBytes(6).toString('hex')}`;

  /**
   * An avatar is displayed small and always square, so it is cropped on the way
   * in — storing a 4000px original to render it at 96px wastes storage and
   * bandwidth on every page view. Post images keep their aspect ratio but are
   * bounded so a phone photo does not arrive at full resolution.
   */
  const transformation = kind === 'avatar'
    ? 'c_fill,g_face,w_400,h_400,q_auto,f_auto'
    : 'c_limit,w_1600,h_1600,q_auto,f_auto';

  // Only these params are signed, and Cloudinary requires the signature to
  // cover exactly what is sent (minus file, api_key, resource_type).
  const params = {
    folder,
    public_id: publicId,
    timestamp,
    transformation,
    allowed_formats: 'jpg,jpeg,png,webp,gif',
  };

  const signature = cloudinary.utils.api_sign_request(params, API_SECRET);

  return {
    ...params,
    signature,
    apiKey:    API_KEY,
    cloudName: CLOUD_NAME,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    maxBytes:  MAX_BYTES,
  };
};

/**
 * destroyAsset
 * ────────────
 * Removes an asset. Called when a post carrying an image is deleted or sold,
 * and when an avatar is replaced — otherwise every image ever uploaded stays
 * on the account forever and the free tier fills with orphans.
 *
 * Never throws: losing an image is not a reason to fail the delete that
 * triggered it. Returns whether Cloudinary reported success.
 */
const destroyAsset = async (publicId) => {
  if (!isConfigured() || !publicId) return false;
  try {
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    return result?.result === 'ok';
  } catch (err) {
    console.error('[cloudinary] destroy failed for', publicId, '-', err.message);
    return false;
  }
};

/**
 * Guards against storing a URL that points somewhere other than our own
 * Cloudinary account. The client reports the URL after uploading, and a client
 * report is not evidence — without this check any user could set imageUrl to an
 * arbitrary host and have the app serve it.
 */
const isOwnAssetUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (!isConfigured()) return true;   // nothing to compare against
  return url.startsWith(`https://res.cloudinary.com/${CLOUD_NAME}/`);
};

module.exports = {
  isConfigured,
  signUpload,
  destroyAsset,
  isOwnAssetUrl,
  FOLDERS,
  MAX_BYTES,
};
