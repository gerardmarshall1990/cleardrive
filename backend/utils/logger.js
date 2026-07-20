// Minimal structured logger. Keeps console output consistent across services
// and gives us one place to swap in a real logging provider later.
function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info: (msg, meta = {}) => console.log(`[INFO] ${timestamp()} ${msg}`, meta && Object.keys(meta).length ? meta : ''),
  warn: (msg, meta = {}) => console.warn(`[WARN] ${timestamp()} ${msg}`, meta && Object.keys(meta).length ? meta : ''),
  error: (msg, meta = {}) => console.error(`[ERROR] ${timestamp()} ${msg}`, meta && Object.keys(meta).length ? meta : ''),
  mock: (service, msg, meta = {}) => console.log(`[MOCK:${service}] ${timestamp()} ${msg}`, meta && Object.keys(meta).length ? meta : ''),
};

module.exports = logger;
