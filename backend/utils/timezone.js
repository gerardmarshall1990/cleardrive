// All timestamps in the app are displayed/stored relative to Asia/Dubai (UTC+4),
// even though Postgres stores them as UTC timestamptz. These helpers centralise
// the conversion so every service formats dates identically.

const DUBAI_TZ = 'Asia/Dubai';

/**
 * Returns current time as a JS Date (UTC internally — Postgres timestamptz-safe).
 */
function nowUtc() {
  return new Date();
}

/**
 * Formats a Date/ISO-string for display in Asia/Dubai time.
 * e.g. "20 Jul 2026, 14:35"
 */
function formatDubai(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DUBAI_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Returns true if the given date is older than `hours` hours from now.
 * Used to reject stale RTA fines screenshots (must be < 24h old).
 */
function isOlderThanHours(date, hours) {
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  return diffMs > hours * 60 * 60 * 1000;
}

module.exports = { DUBAI_TZ, nowUtc, formatDubai, isOlderThanHours };
