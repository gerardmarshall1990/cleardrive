// ClearDrive backend entry point.
// override:true ensures values in .env win over any empty/stale variables
// that may already exist in the parent shell environment.
require('dotenv').config({ override: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const dealRoutes = require('./routes/dealRoutes');
const partnerRoutes = require('./routes/partnerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
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

// Restrict cross-origin requests to the real frontend(s). Native mobile HTTP
// clients aren't browsers and don't send an Origin header, so this has no
// effect on the mobile app — it only stops arbitrary websites from calling
// this API directly from a browser. Add more comma-separated origins to
// ALLOWED_ORIGINS in .env (e.g. a custom domain) without a code change.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.APP_BASE_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Allow no-Origin requests (curl, mobile apps, server-to-server) and
      // any explicitly allow-listed browser origin.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);
app.use(morgan('dev'));
// verify captures the raw request bytes onto req.rawBody — needed so webhook
// signature verification (middleware/webhookSignature.js) can HMAC the exact
// payload a provider signed, rather than a re-serialized (possibly
// byte-different) JSON.stringify(req.body).
app.use(express.json({ limit: '15mb', verify: (req, res, buf) => { req.rawBody = buf; } })); // generous limit — fines screenshots are sent as base64
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'cleardrive-backend', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/webhooks', webhookRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`ClearDrive backend listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  startAutomationEngine();
});

module.exports = app;
