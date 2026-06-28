// ==========================
//  LIB: HASH FORMATTING
//  Comprehensive hash formatting
// ==========================

/**
 * Format hashrate with appropriate unit
 */
export function formatHashRate(value, unit = 'H/s') {
  const num = Number(value);
  if (!num || !Number.isFinite(num) || num <= 0) return '0.00 H/s';
  
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  let i = 0;
  let rate = num;
  
  while (rate >= 1000 && i < units.length - 1) {
    rate /= 1000;
    i++;
  }
  
  return `${rate.toFixed(2)} ${units[i]}`;
}

/**
 * Format hashrate with fixed unit
 */
export function formatHashRateFixed(value, unit = 'H/s') {
  const num = Number(value);
  if (!num || !Number.isFinite(num)) return '0.00 H/s';
  return `${num.toFixed(2)} ${unit}`;
}

/**
 * Parse hashrate string to number
 */
export function parseHashRate(str) {
  if (!str) return 0;
  const match = String(str).match(/^([\d.]+)\s*([A-Za-z]+\/s)?$/);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'H/s').toUpperCase();
  
  const multipliers = {
    'H/S': 1,
    'KH/S': 1000,
    'MH/S': 1000000,
    'GH/S': 1000000000,
    'TH/S': 1000000000000,
    'PH/S': 1000000000000000,
    'EH/S': 1000000000000000000
  };
  
  const multiplier = multipliers[unit] || 1;
  return value * multiplier;
}

/**
 * Get appropriate unit for value
 */
export function getHashUnit(value) {
  const num = Number(value);
  if (!num || !Number.isFinite(num) || num <= 0) return 'H/s';
  
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  let i = 0;
  let rate = num;
  
  while (rate >= 1000 && i < units.length - 1) {
    rate /= 1000;
    i++;
  }
  
  return units[i];
}

/**
 * Format time ago
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return 'N/A';
  
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  
  if (diff < 0) return 'Future';
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Format currency
 */
export function formatCurrency(value, currency = 'QRL') {
  const num = Number(value);
  if (!num || !Number.isFinite(num)) return `0.0000 ${currency}`;
  
  if (Math.abs(num) < 0.0001) {
    return `<0.0001 ${currency}`;
  }
  
  if (Math.abs(num) < 1) {
    return `${num.toFixed(4)} ${currency}`;
  }
  
  if (Math.abs(num) < 100) {
    return `${num.toFixed(2)} ${currency}`;
  }
  
  return `${num.toFixed(0)} ${currency}`;
}

/**
 * Format USD value
 */
export function formatUSD(value) {
  const num = Number(value);
  if (!num || !Number.isFinite(num) || num <= 0) return '0.00 USD';
  
  if (num < 0.01) {
    return `<0.01 USD`;
  }
  
  if (num < 1) {
    return `${num.toFixed(4)} USD`;
  }
  
  if (num < 100) {
    return `${num.toFixed(2)} USD`;
  }
  
  if (num < 1000) {
    return `${num.toFixed(0)} USD`;
  }
  
  return `${(num / 1000).toFixed(1)}K USD`;
}