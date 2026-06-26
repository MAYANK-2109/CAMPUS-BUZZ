/**
 * routes/userRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * User routes
 */

const router = require('express').Router();
const { protect } = require('../middleware/auth');
const userController = require('../controllers/userController');

// ── GET & PATCH /api/users/profile ───────────────────────────────────────────
router.patch('/profile', protect, userController.updateProfile);

module.exports = router;
