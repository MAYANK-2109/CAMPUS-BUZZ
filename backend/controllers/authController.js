/**
 * controllers/authController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles user registration and login.
 *
 * POST /api/auth/register  → register a new user
 * POST /api/auth/login     → authenticate and receive JWT
 * GET  /api/auth/me        → return current user from token (protect required)
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Helper: sign a JWT for a user document ───────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ── Helper: send sanitised response (never expose passwordHash) ──────────────
const sendAuthResponse = (res, statusCode, user, token) => {
  const safeUser = {
    _id:            user._id,
    rollNo:         user.rollNo,
    instituteEmail: user.instituteEmail,
    role:           user.role,
    isVerified:     user.isVerified,
    displayName:    user.displayName,
    bio:            user.bio,
    avatarUrl:      user.avatarUrl,
    createdAt:      user.createdAt,
  };

  return res.status(statusCode).json({
    success: true,
    token,
    user: safeUser,
  });
};

// ── POST /api/auth/register ──────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { rollNo, instituteEmail, password, role, displayName } = req.body;

    // Check for duplicate email or roll number
    const query = [{ instituteEmail: instituteEmail?.toLowerCase() }];
    if (rollNo) {
      query.push({ rollNo: rollNo?.toUpperCase() });
    }

    const existing = await User.findOne({ $or: query });

    if (existing) {
      const field = existing.rollNo && rollNo && existing.rollNo === rollNo.toUpperCase() ? 'Roll number' : 'Email';
      return res.status(409).json({
        success: false,
        message: `${field} already registered.`,
      });
    }

    // passwordHash field triggers the pre-save bcrypt hook in User model
    const user = await User.create({
      rollNo:         rollNo ? rollNo.toUpperCase() : undefined,
      instituteEmail: instituteEmail.toLowerCase(),
      passwordHash:   password,       // Hook will hash this
      role:           role || 'Student',
      displayName:    displayName || rollNo,
      isVerified:     false,
    });

    const token = signToken(user);
    return sendAuthResponse(res, 201, user, token);
  } catch (err) {
    console.error('[authController.register]', err);

    // Mongoose duplicate key (race condition after our check)
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate field value.' });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(422).json({ success: false, message: messages.join(' ') });
    }

    return res.status(500).json({ success: false, message: 'Registration failed.' });
  }
};

// ── POST /api/auth/login ─────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { instituteEmail, password } = req.body;

    if (!instituteEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // findByEmailWithPassword explicitly selects passwordHash
    const user = await User.findByEmailWithPassword(instituteEmail);

    if (!user) {
      // Generic message prevents email enumeration
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = signToken(user);
    return sendAuthResponse(res, 200, user, token);
  } catch (err) {
    console.error('[authController.login]', err);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
};

// ── GET /api/auth/me  (requires protect middleware) ──────────────────────────
exports.getMe = async (req, res) => {
  // req.user is attached by the protect middleware
  return res.status(200).json({ success: true, user: req.user });
};
