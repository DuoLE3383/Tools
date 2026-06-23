// server/logger.js - Centralized logging with levels
// Usage: LOG_LEVEL=DEBUG|INFO|WARN|ERROR to control verbosity

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function shouldLog(level) {
  return LOG_LEVELS[level] >= currentLevel;
}

// Suppressed patterns - messages matching these won't be logged
const SUPPRESSED_PATTERNS = [
  // Noisy MRR clock sync lines
  /\[mrr:clock\] Synchronizing with/,
  /\[mrr:clock\] Could not sync with MRR/,
  // NUCLEAR JUMP (final status line already shows the result)
  /☢️ NUCLEAR JUMP/,
  // HMAC retry (final status line already shows the success/failure)
  /HMAC failed.*retrying with Legacy SHA1/,
  // First-time endpoint delay
  /First-time endpoint delay/,
  // First-time load delay
  /First-time load delay/,
  // Monitor rental summary line
  /rentals fetched: sold=\d+, bought=\d+, rig-rented-flags=\d+/,
  // Bought rental ignoring message
  /Ignoring \d+ bought rental/,
  // ROI price skipped (gets repeated every cycle)
  /ROI price skipped/,
];

// Suppressed account prefixes
const SUPPRESSED_ACCOUNTS = ['LUCKY'];

function isSuppressed(message) {
  // Suppress by account tag
  for (const acct of SUPPRESSED_ACCOUNTS) {
    if (message.includes(`:${acct}]`)) return true;
  }
  // Suppress by pattern
  for (const pattern of SUPPRESSED_PATTERNS) {
    if (pattern.test(message)) return true;
  }
  return false;
}

export const logger = {
  debug: (...args) => {
    if (!shouldLog('DEBUG')) return;
    const msg = args.join(' ');
    if (isSuppressed(msg)) return;
    console.log(`[DEBUG] ${msg}`);
  },

  info: (...args) => {
    if (!shouldLog('INFO')) return;
    const msg = args.join(' ');
    if (isSuppressed(msg)) return;
    console.log(msg);
  },

  warn: (...args) => {
    if (!shouldLog('WARN')) return;
    const msg = args.join(' ');
    if (isSuppressed(msg)) return;
    console.warn(msg);
  },

  error: (...args) => {
    if (!shouldLog('ERROR')) return;
    const msg = args.join(' ');
    // Don't suppress errors unless explicitly LUCKY
    for (const acct of SUPPRESSED_ACCOUNTS) {
      if (msg.includes(`:${acct}]`)) return;
    }
    console.error(msg);
  },

  // Raw log without suppression (for important messages)
  raw: (...args) => console.log(args.join(' ')),
};
