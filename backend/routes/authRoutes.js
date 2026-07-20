const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/authController');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  next();
}

router.post(
  '/signup',
  [
    body('email').isEmail(),
    body('password').isString().isLength({ min: 8 }),
    body('fullName').isString().notEmpty(),
    body('phone').isString().notEmpty(),
    body('role').isIn(['seller', 'buyer', 'dealer', 'broker']),
  ],
  validate,
  asyncHandler(authController.signup)
);

router.post('/login', [body('email').isEmail(), body('password').isString().notEmpty()], validate, asyncHandler(authController.login));

router.get('/me', requireAuth, asyncHandler(authController.me));

module.exports = router;
