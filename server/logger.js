// server/logger.js

function log(level, ...args) {
  const timestamp = new Date().toLocaleTimeString();
  const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

export const logger = {
  log: (...args) => log('info', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  debug: (...args) => {
    // Only log debug messages if not in production
    if (process.env.NODE_ENV !== 'production') {
      log('debug', ...args);
    }
  },
};