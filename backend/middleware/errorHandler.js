// Global error handler — logs full error detail to the DB silently, and
// returns only a friendly message to the client, per design spec
// ("never show raw error messages ... always give the user a next action").

const Sentry = require('@sentry/node');
const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');

// Wraps async route handlers so thrown errors reach the error handler below
// instead of crashing the process (Express doesn't catch async rejections by default).
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// eslint-disable-next-line no-unused-vars
async function globalErrorHandler(err, req, res, next) {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, { error: err.message, stack: err.stack });

  // No-op if SENTRY_DSN isn't set — real-time alerting is additive to the
  // existing error_log table below, not a replacement for it.
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, { extra: { route: `${req.method} ${req.originalUrl}` } });
  }

  try {
    await supabaseAdmin.from('error_log').insert({
      route: `${req.method} ${req.originalUrl}`,
      message: err.message,
      stack: err.stack,
      deal_id: req.params?.id && isUuid(req.params.id) ? req.params.id : null,
    });
  } catch (logErr) {
    // If even error logging fails, don't let it crash the response cycle.
    logger.error('Failed to write to error_log table', { error: logErr.message });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    error: 'Something went wrong — please try again',
    nextAction: 'If this keeps happening, contact support via WhatsApp from the app.',
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

module.exports = { asyncHandler, globalErrorHandler, notFoundHandler };
