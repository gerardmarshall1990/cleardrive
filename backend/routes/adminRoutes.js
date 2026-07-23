const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/deals', requireAuth, requireRole('admin'), asyncHandler(adminController.getAllDeals));
router.get('/stats', requireAuth, requireRole('admin'), asyncHandler(adminController.getStats));
router.get('/deals/:id', requireAuth, requireRole('admin'), asyncHandler(adminController.getDealDetail));
router.put('/deals/:id/override', requireAuth, requireRole('admin'), asyncHandler(adminController.manualOverride));
router.put('/deals/:id/force-stage', requireAuth, requireRole('admin'), asyncHandler(adminController.forceStage));
router.put('/deals/:id/reassign', requireAuth, requireRole('admin'), asyncHandler(adminController.reassignParty));
router.put('/deals/:id/party/:role/identity', requireAuth, requireRole('admin'), asyncHandler(adminController.updatePartyIdentity));
router.post('/deals/:id/resend-signing-invite', requireAuth, requireRole('admin'), asyncHandler(adminController.resendSigningInvite));
router.put('/deals/:id/referral', requireAuth, requireRole('admin'), asyncHandler(adminController.updateReferral));
router.get('/deals/:id/audit-log', requireAuth, requireRole('admin'), asyncHandler(adminController.getDealAuditLog));

module.exports = router;
