/**
 * middleware/validate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised express-validator result checker.
 *
 * Usage:
 *   const { body } = require('express-validator');
 *   router.post('/login', [
 *     body('instituteEmail').isEmail(),
 *     body('password').notEmpty(),
 *     validate,
 *   ], loginController);
 */

const { validationResult } = require('express-validator');

/**
 * validate
 * ────────
 * Inspects the express-validator result bag. If any errors exist, responds
 * with 422 and the full list of field-level errors. Otherwise calls next().
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors:  errors.array().map((e) => ({
        field:   e.path,
        message: e.msg,
        value:   e.value,
      })),
    });
  }

  next();
};

module.exports = { validate };
