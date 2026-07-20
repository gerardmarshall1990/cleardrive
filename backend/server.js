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

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '15mb' })); // generous limit — fines screenshots are sent as base64
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
