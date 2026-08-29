/**
 * src/utils/uploadMedia.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Uploads an image to Cloudinary from the browser.
 *
 * Two steps: ask our backend to sign the upload, then POST the file straight to
 * Cloudinary. The file never travels through our server — see
 * backend/utils/cloudinary.js for why that matters on a memory-constrained host.
 *
 *   const { url, publicId } = await uploadImage(file, 'post', setPct);
 *
 * Throws an Error with a message safe to show the user.
 */

import api from './api';

/** Accepted client-side. The signed params enforce the same list server-side. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Thrown when the server has no Cloudinary credentials, so callers can fall
 *  back to the paste-a-URL field instead of showing an error. */
export class UploadNotConfiguredError extends Error {}

/**
 * uploadImage
 * ───────────
 * @param {File}     file
 * @param {'post'|'avatar'} kind
 * @param {Function} onProgress  Receives 0-100.
 * @returns {Promise<{url: string, publicId: string, width: number, height: number}>}
 */
export const uploadImage = async (file, kind = 'post', onProgress) => {
  if (!file) throw new Error('No file selected.');
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
  }

  // ── 1. Signature ──────────────────────────────────────────────────────────
  let sig;
  try {
    const { data } = await api.post('/media/signature', { kind });
    sig = data.data;
  } catch (err) {
    if (err.response?.status === 503) {
      throw new UploadNotConfiguredError(
        err.response.data?.message || 'Image upload is not configured on this server.',
      );
    }
    throw new Error('Could not start the upload. Please try again.');
  }

  if (file.size > sig.maxBytes) {
    throw new Error(`That image is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${Math.round(sig.maxBytes / 1048576)} MB.`);
  }

  // ── 2. Straight to Cloudinary ─────────────────────────────────────────────
  // Every field here is covered by the signature. Changing any of them client
  // side invalidates it, which is the point: the browser can only upload what
  // the server agreed to.
  const form = new FormData();
  form.append('file', file);
  form.append('api_key',         sig.apiKey);
  form.append('timestamp',       sig.timestamp);
  form.append('signature',       sig.signature);
  form.append('folder',          sig.folder);
  form.append('public_id',       sig.public_id);
  form.append('transformation',  sig.transformation);
  form.append('allowed_formats', sig.allowed_formats);

  /**
   * XHR rather than fetch, purely because fetch still cannot report upload
   * progress. On hostel wifi an 8 MB photo is a long silent wait otherwise.
   */
  const result = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let body;
      try { body = JSON.parse(xhr.responseText); }
      catch { return reject(new Error('Upload failed — unexpected response.')); }

      if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
      reject(new Error(body?.error?.message || 'Upload was rejected.'));
    };

    xhr.onerror   = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Try a smaller image.'));
    xhr.timeout   = 120000;

    xhr.send(form);
  });

  return {
    url:      result.secure_url,
    publicId: result.public_id,
    width:    result.width,
    height:   result.height,
  };
};

/** Best-effort removal of an upload the user then discarded. */
export const deleteUpload = async (publicId) => {
  if (!publicId) return;
  try { await api.delete('/media', { data: { publicId } }); }
  catch { /* orphan cleanup is not worth surfacing to the user */ }
};
