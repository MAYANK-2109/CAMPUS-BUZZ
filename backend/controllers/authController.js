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
const crypto = require('crypto');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// ── Helper: sign a JWT for a user document ───────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ── Helper: generate a fresh OTP for a user and email it ─────────────────────
const issueAndSendOtp = async (user) => {
  const otp = user.generateOtp();
  await user.save({ validateBeforeSave: false });

  await sendEmail({
    email:   user.instituteEmail,
    subject: 'Your CampusBuzz verification code',
    message:
      `Welcome to CampusBuzz!\n\n` +
      `Your email verification code is: ${otp}\n\n` +
      `This code will expire in 10 minutes. ` +
      `If you did not create an account, you can safely ignore this email.`,
  });
};

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
    const email = instituteEmail?.toLowerCase();
    const roll  = rollNo ? rollNo.toUpperCase() : undefined;

    // An account with this email may already exist.
    const existingByEmail = await User.findOne({ instituteEmail: email }).select('+otpHash');
    if (existingByEmail) {
      // Verified → genuine duplicate.
      if (existingByEmail.isVerified) {
        return res.status(409).json({ success: false, message: 'Email already registered.' });
      }
      // Unverified → a previous, incomplete signup. Re-send a code so the
      // user can finish verifying instead of being blocked.
      await issueAndSendOtp(existingByEmail);
      return res.status(200).json({
        success:             true,
        requiresVerification: true,
        instituteEmail:      email,
        message:             'This email is already registered but not verified. A new code has been sent.',
      });
    }

    // Roll number must be unique across all accounts.
    if (roll) {
      const rollTaken = await User.findOne({ rollNo: roll });
      if (rollTaken) {
        return res.status(409).json({ success: false, message: 'Roll number already registered.' });
      }
    }

    // passwordHash field triggers the pre-save bcrypt hook in User model
    const user = await User.create({
      rollNo:         roll,
      instituteEmail: email,
      passwordHash:   password,       // Hook will hash this
      role:           role || 'Student',
      displayName:    displayName || rollNo,
      isVerified:     false,
    });

    // Email a verification code; user is NOT logged in until verified.
    await issueAndSendOtp(user);
    return res.status(201).json({
      success:             true,
      requiresVerification: true,
      instituteEmail:      email,
      message:             'Verification code sent to your email.',
    });
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

    // Email-verification gate.
    if (!user.isVerified) {
      if (user.otpHash) {
        // Pending verification from the new signup flow → re-send a fresh code.
        await issueAndSendOtp(user);
        return res.status(403).json({
          success:             false,
          requiresVerification: true,
          instituteEmail:      user.instituteEmail,
          message:             'Please verify your email. A new code has been sent.',
        });
      }
      // Legacy account created before OTP existed → auto-verify on login.
      user.isVerified = true;
      await user.save({ validateBeforeSave: false });
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

// ── POST /api/auth/verify-otp ────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { instituteEmail, otp } = req.body;
    if (!instituteEmail || !otp) {
      return res.status(400).json({ success: false, message: 'Email and code are required.' });
    }

    const user = await User.findOne({ instituteEmail: instituteEmail.toLowerCase() }).select('+otpHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found for this email.' });
    }

    // Already verified → just log them in.
    if (user.isVerified) {
      return sendAuthResponse(res, 200, user, signToken(user));
    }

    if (!user.otpHash || !user.otpExpire || new Date(user.otpExpire).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Code has expired. Please request a new one.' });
    }

    if (user.otpAttempts >= 5) {
      return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (!user.verifyOtp(otp)) {
      user.otpAttempts += 1;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ success: false, message: 'Invalid verification code.' });
    }

    // Success → mark verified and clear OTP state.
    user.isVerified  = true;
    user.otpHash     = undefined;
    user.otpExpire   = undefined;
    user.otpAttempts = 0;
    await user.save({ validateBeforeSave: false });

    return sendAuthResponse(res, 200, user, signToken(user));
  } catch (err) {
    console.error('[authController.verifyOtp]', err);
    return res.status(500).json({ success: false, message: 'Verification failed.' });
  }
};

// ── POST /api/auth/resend-otp ────────────────────────────────────────────────
exports.resendOtp = async (req, res) => {
  try {
    const { instituteEmail } = req.body;
    if (!instituteEmail) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ instituteEmail: instituteEmail.toLowerCase() }).select('+otpHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found for this email.' });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'This account is already verified. Please log in.' });
    }

    // Throttle resends to once every 30 seconds.
    if (user.lastOtpSentAt && Date.now() - new Date(user.lastOtpSentAt).getTime() < 30 * 1000) {
      const wait = Math.ceil((30 * 1000 - (Date.now() - new Date(user.lastOtpSentAt).getTime())) / 1000);
      return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting a new code.` });
    }

    await issueAndSendOtp(user);
    return res.status(200).json({ success: true, message: 'A new verification code has been sent.' });
  } catch (err) {
    console.error('[authController.resendOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to send the code. Please try again.' });
  }
};

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ instituteEmail: req.body.instituteEmail.toLowerCase() });

    if (!user) {
      return res.status(404).json({ success: false, message: 'There is no user with that email.' });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });

    // Create reset url
    // Use CLIENT_URL from env or fallback to localhost:3000
    const frontendUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

    try {
      await sendEmail({
        email: user.instituteEmail,
        subject: 'Password reset token',
        message
      });

      return res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
      console.error('[forgotPassword] email error:', err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ success: false, message: 'Email could not be sent' });
    }
  } catch (err) {
    console.error('[authController.forgotPassword]', err);
    return res.status(500).json({ success: false, message: 'Forgot password failed.' });
  }
};

// ── PATCH /api/auth/reset-password/:token ────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }

    // Set new password
    user.passwordHash = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const token = signToken(user);
    return sendAuthResponse(res, 200, user, token);
  } catch (err) {
    console.error('[authController.resetPassword]', err);
    return res.status(500).json({ success: false, message: 'Reset password failed.' });
  }
};
