// ==========================
//  LIB: HASHRATE UTILITIES
//  Pure hashrate conversion functions
// ==========================

import { HASHRATE_SUFFIXES } from '../../src/core/mapping.js';

/**
 * Clean hashrate unit string
 */
export function cleanHashrateUnit(unit) {
  const match = String(unit || '').toUpperCase().match(/GSOL|MSOL|KSOL|SOL|EH|PH|TH|GH|MH|KH|H/);
  return match?.[0] || 'H';
}

/**
 * Convert hashrate value between units
 */
export function convertHashrateValue(value, fromUnit, toUnit) {
  const fromMultiplier = HASHRATE_SUFFIXES[cleanHashrateUnit(fromUnit)] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[cleanHashrateUnit(toUnit)] || 1;
  return value * fromMultiplier / toMultiplier;
}

/**
 * Get algorithm display name
 */
export function ALGO_MAPPING(code, ALGO_DISPLAY_NAMES) {
  if (!code) return 'N/A';
  const uc = String(code).toUpperCase();
  return ALGO_DISPLAY_NAMES[uc] || code;
}

/**
 * Format hashrate for display
 */
export function formatHashrate(value, unit, precision = 2) {
  if (!value || isNaN(value)) return '0 H/s';
  const formatted = value.toFixed(precision);
  return `${formatted} ${unit || 'H/s'}`;
}

/**
 * Calculate efficiency percentage
 */
export function calculateEfficiency(actual, expected) {
  if (!expected || expected <= 0) return 0;
  return Math.min(100, (actual / expected) * 100);
}

/**
 * Get performance emoji based on efficiency
 */
export function getPerformanceEmoji(efficiency) {
  if (efficiency >= 100) return '☑️';
  if (efficiency >= 90) return '🟢';
  if (efficiency >= 70) return '📶';
  if (efficiency >= 50) return '💤';
  return '🚼';
}