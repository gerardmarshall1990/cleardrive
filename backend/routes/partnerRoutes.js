const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const partnerController = require('../controllers/partnerController');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  next();
}

router.post(
  '/',
  requireAuth,
  [body('name').isString().notEmpty(), body('phone').isString().notEmpty(), body('type').isIn(['dealer', 'broker'])],
  validate,
  asyncHandler(partnerController.createPartner)
);

router.get('/mine', requireAuth, asyncHandler(partnerController.getMyPartner));
router.get('/mine/deals', requireAuth, asyncHandler(partnerController.getMyPartnerDeals));

router.get('/:id', requireAuth, asyncHandler(partnerController.getPartner));
router.get('/:id/deals', requireAuth, asyncHandler(partnerController.getPartnerDeals));

module.exports = router;
