// ClearDrive backend entry point.
// override:true ensures values in .env win over any empty/stale variables
// that may already exist in the parent shell environment.
require('dotenv').config({ override: true });

const Sentry = require('@sentry/node');
// No-op until SENTRY_DSN is set (sign up free at sentry.io, paste the DSN into
// .env / Render env vars) — until then this call does nothing and costs nothing.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const dealRoutes = require('./routes/dealRoutes');
const partnerRoutes = require('./routes/partnerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const mockRoutes = require('./routes/mockRoutes');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { startAutomationEngine } = require('./services/automationEngine');
const logger = require('./utils/logger');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const app = express();
// Behind Render's (and any other) reverse proxy so req.protocol/req.secure
// reflect the original https request rather than the internal http hop —
// needed so the mock TrustIn/UAE Pass popup URL (built from req.protocol +
// req.get('host')) is correct in production.
app.set('trust proxy', 1);

// Restrict cross-origin requests to the real frontend(s). Native mobile HTTP
// clients aren't browsers and don't send an Origin header, so this has no
// effect on the mobile app — it only stops arbitrary websites from calling
// this API directly from a browser. Add more comma-separated origins to
// ALLOWED_ORIGINS in .env (e.g. a custom domain) without a code change.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.APP_BASE_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow no-Origin requests (curl, mobile apps, server-to-server) and
    // any explicitly allow-listed browser origin.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
});

app.use(helmet());
app.use(morgan('dev'));
// verify captures the raw request bytes onto req.rawBody — needed so webhook
// signature verification (middleware/webhookSignature.js) can HMAC the exact
// payload a provider signed, rather than a re-serialized (possibly
// byte-different) JSON.stringify(req.body).
app.use(express.json({ limit: '15mb', verify: (req, res, buf) => { req.rawBody = buf; } })); // generous limit — fines screenshots are sent as base64
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'cleardrive-backend', time: new Date().toISOString() }));

// /webhooks and /mock are intentionally NOT behind the browser-CORS check
// above: webhook calls are server-to-server (no Origin header) and the mock
// TrustIn/UAE Pass popup page (served here) calls /webhooks/trustin as a
// same-origin POST, which browsers attach an Origin header to — that origin
// is this backend's own host, never one of the frontend ALLOWED_ORIGINS, so
// applying the frontend-only CORS check here would break the mock flow.
app.use('/webhooks', webhookRoutes);
app.use('/mock', mockRoutes);

app.use('/api', corsMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`ClearDrive backend listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  startAutomationEngine();
});

module.exports = app;
