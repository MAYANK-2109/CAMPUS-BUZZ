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

// ── PATCH /api/users/change-password ─────────────────────────────────────────
router.patch('/change-password', protect, userController.changePassword);

// ── GET /api/users/:id ───────────────────────────────────────────────────────
router.get('/:id', protect, userController.getUserProfile);

module.exports = router;
