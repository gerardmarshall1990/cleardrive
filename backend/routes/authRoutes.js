const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/authController');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  next();
}

const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many signup attempts — please try again in an hour' });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts — please try again in 15 minutes' });

router.post(
  '/signup',
  signupLimiter,
  [
    body('email').isEmail(),
    body('password').isString().isLength({ min: 8 }),
    body('fullName').isString().notEmpty(),
    body('phone').isString().notEmpty(),
    body('role').isIn(['individual', 'dealer', 'broker']),
  ],
  validate,
  asyncHandler(authController.signup)
);

router.post('/login', loginLimiter, [body('email').isEmail(), body('password').isString().notEmpty()], validate, asyncHandler(authController.login));

router.get('/me', requireAuth, asyncHandler(authController.me));

module.exports = router;
