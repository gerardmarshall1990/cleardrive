// Public (unauthenticated) routes that serve MOCK third-party pages the app
// opens in a popup — currently just the TrustIn/UAE Pass KYC mock. No auth
// header can be attached to a window.open() URL, so the opaque session id
// in the path is the page's only access token, same as a real hosted
// identity-verification redirect link.
const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const mockTrustInKycController = require('../controllers/mockTrustInKycController');

router.get('/trustin-kyc/:sessionId', asyncHandler(mockTrustInKycController.renderVerificationPage));

module.exports = router;
