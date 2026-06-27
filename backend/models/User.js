/**
 * models/User.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Mongoose schema for campus users.
 *
 * Institute email format:
 *   [FirstInitial][LastName][Last3DigitsOfRollNo].[Degree][AdmissionYear]
 *   @[Department].nitrr.ac.in
 *   e.g.  jdoe123.btech2022@cse.nitrr.ac.in
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

// ── Validation regex for the institute email format ──────────────────────────
const INSTITUTE_EMAIL_REGEX =
  /^[a-z]{2,}\d{3}\.[a-z]+\d{4}@([a-z]+\.)?nitrr\.ac\.in$/i;

const UserSchema = new mongoose.Schema(
  {
    rollNo: {
      type:     String,
      required: function() { return this.role === 'Student'; },
      unique:   true,
      sparse:   true,
      trim:     true,
      uppercase: true,
    },

    instituteEmail: {
      type:     String,
      required: [true, 'Institute email is required'],
      unique:   true,
      lowercase: true,
      trim:     true,
      validate: {
        validator: function(v) {
          if (this.role === 'Student') return INSTITUTE_EMAIL_REGEX.test(v);
          return /@([a-z]+\.)?nitrr\.ac\.in$/i.test(v);
        },
        message:   (p) => `${p.value} is not a valid NITRR institute email`,
      },
    },

    passwordHash: {
      type:     String,
      required: [true, 'Password is required'],
      select:   false,   // Never return the hash in queries by default
    },

    role: {
      type:    String,
      enum:    {
        values:  ['Student', 'Club', 'Admin'],
        message: 'Role must be Student, Club, or Admin',
      },
      default: 'Student',
    },

    isVerified: {
      type:    Boolean,
      default: false,
    },

    // Display name derived from email, stored for convenience
    displayName: {
      type:  String,
      trim:  true,
    },

    bio: {
      type: String,
      trim: true,
      maxlength: [150, 'Bio cannot exceed 150 characters'],
      default: '',
    },

    avatarUrl: {
      type: String,
      trim: true,
      default: null,
    },

    // Follow system: students follow clubs; clubs accumulate followers
    followers: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ],
    following: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ],

    /**
     * savedPosts: private bookmarks. Only the owning user can read this list.
     * Toggled via POST /api/posts/:id/save.
     */
    savedPosts: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Post' }
    ],

    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // ── Email OTP verification (signup) ──────────────────────────────────────
    otpHash:       { type: String, select: false }, // sha256 of the 6-digit code
    otpExpire:     Date,
    otpAttempts:   { type: Number, default: 0 },     // wrong-attempt counter
    lastOtpSentAt: Date,                             // for resend throttling
  },
  {
    timestamps: true,   // createdAt, updatedAt
  }
);

// ── Pre-save hook: hash password before persisting ──────────────────────────
UserSchema.pre('save', async function hashPassword(next) {
  // Only re-hash when the passwordHash field is actually modified
  if (!this.isModified('passwordHash')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ── Instance method: compare a plaintext password against the stored hash ───
UserSchema.methods.comparePassword = async function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// ── Instance method: generate and hash password token ───────────────────────
UserSchema.methods.getResetPasswordToken = function() {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire (10 minutes)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// ── Instance method: generate a 6-digit OTP, store its hash + expiry ─────────
UserSchema.methods.generateOtp = function generateOtp() {
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  this.otpHash       = crypto.createHash('sha256').update(otp).digest('hex');
  this.otpExpire     = Date.now() + 10 * 60 * 1000; // 10 minutes
  this.otpAttempts   = 0;
  this.lastOtpSentAt = new Date();
  return otp;
};

// ── Instance method: validate a candidate OTP (hash compare + not expired) ───
UserSchema.methods.verifyOtp = function verifyOtp(candidate) {
  if (!this.otpHash || !this.otpExpire) return false;
  if (new Date(this.otpExpire).getTime() < Date.now()) return false;
  const hash = crypto.createHash('sha256').update(String(candidate)).digest('hex');
  return hash === this.otpHash;
};

// ── Static helper: find by email (selects passwordHash + otpHash explicitly) ─
UserSchema.statics.findByEmailWithPassword = function findByEmailWithPassword(email) {
  return this.findOne({ instituteEmail: email.toLowerCase() }).select('+passwordHash +otpHash');
};

module.exports = mongoose.model('User', UserSchema);
