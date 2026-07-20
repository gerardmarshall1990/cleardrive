const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/deals', requireAuth, requireRole('admin'), asyncHandler(adminController.getAllDeals));
router.get('/stats', requireAuth, requireRole('admin'), asyncHandler(adminController.getStats));
router.put('/deals/:id/override', requireAuth, requireRole('admin'), asyncHandler(adminController.manualOverride));

module.exports = router;
