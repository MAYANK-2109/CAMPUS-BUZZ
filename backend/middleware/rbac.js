/**
 * middleware/rbac.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Role-Based Access Control (RBAC) middleware.
 *
 * Usage (always chain AFTER `protect`):
 *   router.post('/events', protect, requireRole(['Club', 'Admin']), createEvent);
 *
 * Design:
 *   requireRole returns a middleware factory so the allowed roles are captured
 *   in closure – no global state, fully composable.
 */

/**
 * requireRole
 * ───────────
 * @param {string[]} allowedRoles  Array of role strings that are permitted.
 * @returns {Function}             Express middleware.
 *
 * req.user must be set by the `protect` middleware before this runs.
 */
const requireRole = (allowedRoles) => {
  // Validate the roles array at definition time (fail fast during startup)
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('requireRole() expects a non-empty array of role strings.');
  }

  const validRoles = new Set(['Student', 'Club', 'Admin']);
  allowedRoles.forEach((r) => {
    if (!validRoles.has(r)) {
      throw new Error(`requireRole(): "${r}" is not a valid role.`);
    }
  });

  // Return the actual Express middleware
  return (req, res, next) => {
    // protect middleware must have run first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before role check.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access forbidden. Required role(s): ${allowedRoles.join(', ')}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
};

/**
 * Convenience pre-built guards for common patterns.
 * Import these directly instead of calling requireRole() each time.
 */
const adminOnly   = requireRole(['Admin']);
const clubOrAdmin = requireRole(['Club', 'Admin']);
const anyRole     = requireRole(['Student', 'Club', 'Admin']); // All authenticated users

module.exports = { requireRole, adminOnly, clubOrAdmin, anyRole };
