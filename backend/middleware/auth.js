/**
 * middleware/auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the JWT in the Authorization header and attaches the decoded
 * user payload to req.user. All protected routes use this middleware.
 *
 * Expected header:
 *   Authorization: Bearer <token>
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/**
 * protect
 * ───────
 * 1. Extract the token from the Authorization: Bearer header.
 * 2. Verify the token using JWT_SECRET.
 * 3. Look up the user in MongoDB (ensures the account still exists).
 * 4. Attach the lean user object to req.user and call next().
 */
const protect = async (req, res, next) => {
  try {
    // ── 1. Extract token ──────────────────────────────────────────────────────
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    // ── 2. Verify signature + expiry ─────────────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Token expired. Please log in again.'
          : 'Invalid token. Please log in again.';
      return res.status(401).json({ success: false, message });
    }

    // ── 3. Confirm user still exists in DB ────────────────────────────────────
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User belonging to this token no longer exists.',
      });
    }

    // ── 4. Attach to request ──────────────────────────────────────────────────
    req.user = user;
    next();
  } catch (err) {
    console.error('[protect middleware]', err);
    return res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

module.exports = { protect };
