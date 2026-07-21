const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const dealController = require('../controllers/dealController');
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
  [
    body('product').isIn(['loanclear', 'safepay']),
    body('sellerId').optional().isUUID(),
    body('sellerPhone').optional().isString(),
    body('plate').isString().notEmpty(),
    body('salePrice').isFloat({ gt: 0 }),
  ],
  validate,
  asyncHandler(dealController.createDeal)
);

router.get('/mine', requireAuth, asyncHandler(dealController.listMine));

router.post(
  '/:id/join',
  requireAuth,
  [body('role').isIn(['seller', 'buyer'])],
  validate,
  asyncHandler(dealController.joinDeal)
);

router.get('/:id', requireAuth, asyncHandler(dealController.getDeal));

router.put(
  '/:id/stage',
  requireAuth,
  [body('targetStage').isString().notEmpty()],
  validate,
  asyncHandler(dealController.advanceStage)
);

router.post(
  '/:id/fines-verify',
  requireAuth,
  [body('imageBase64').isString().notEmpty()],
  validate,
  asyncHandler(dealController.verifyFines)
);

router.post(
  '/:id/extract-mulkiya',
  requireAuth,
  [body('imageBase64').isString().notEmpty()],
  validate,
  asyncHandler(dealController.extractMulkiya)
);

router.post(
  '/:id/extract-settlement',
  requireAuth,
  [body('imageBase64').isString().notEmpty()],
  validate,
  asyncHandler(dealController.extractSettlement)
);

router.post(
  '/:id/extract-eid',
  requireAuth,
  [body('imageBase64').isString().notEmpty()],
  validate,
  asyncHandler(dealController.extractEid)
);

router.patch(
  '/:id/kyc',
  requireAuth,
  [body('fullName').isString().notEmpty(), body('eidNumber').isString().notEmpty()],
  validate,
  asyncHandler(dealController.confirmKyc)
);

router.patch('/:id/details', requireAuth, asyncHandler(dealController.updateDetails));

router.patch('/:id/buyer', requireAuth, [body('buyerPhone').isString().notEmpty()], validate, asyncHandler(dealController.attachBuyer));

router.post('/:id/generate-docs', requireAuth, asyncHandler(dealController.generateDocs));

router.get('/:id/docs', requireAuth, asyncHandler(dealController.getDocs));

router.post(
  '/:id/complete',
  requireAuth,
  [body('transferCertUrl').isString().notEmpty()],
  validate,
  asyncHandler(dealController.completeDeal)
);

module.exports = router;
