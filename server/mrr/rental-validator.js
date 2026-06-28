// ==========================
//  LIB: RENTAL VALIDATOR
//  Pure validation functions
// ==========================

import { parseUtcDate } from './rental-utils.js';
import { extractRentalInfo } from '../utils.js';

/**
 * Check if a rental is real (has mining activity)
 */
export function isRealRental(rental, info, now = Date.now()) {
  if (!rental || !info) return false;

  // Must have valid ID
  const hasValidId = rental.id || rental.rentalid || rental.rental_id;
  if (!hasValidId) return false;

  // Check for activity
  const currentHash = parseFloat(info.hashrate?.current || 0);
  const averageHash = parseFloat(info.hashrate?.average || 0);
  const advertisedHash = parseFloat(info.hashrate?.advertised || 0);
  const paidAmount = parseFloat(info.price?.paid || 0);

  // Has activity = real
  if (currentHash > 0 || averageHash > 0 || advertisedHash > 0 || paidAmount > 0) {
    return true;
  }

  // Grace period for new rentals
  const rawStart = info.startTime || rental.start_time || rental.startTime || rental.created_at || 0;
  if (rawStart) {
    const startT = parseUtcDate(rawStart);
    const ageMs = now - startT;
    if (ageMs > 0 && ageMs < 60 * 60 * 1000) return true;
  }

  // Paid rentals are real even without hashrate
  if (paidAmount > 0) return true;

  // Rentals ending within 24h are real
  const rawEnd = info.endTime || rental.end_time || rental.endTime || 0;
  if (rawEnd) {
    const endT = parseUtcDate(rawEnd);
    if (endT > now && endT - now < 24 * 60 * 60 * 1000) {
      return true;
    }
  }

  return false;
}

/**
 * Validate and split rentals
 */
export function splitRentals(rentals, now = Date.now()) {
  const result = {
    real: [],
    ghost: [],
    realIds: [],
    ghostIds: []
  };

  if (!Array.isArray(rentals)) return result;

  const realIdSet = new Set();
  const ghostIdSet = new Set();

  for (const rental of rentals) {
    const info = extractRentalInfo(rental);
    const isValid = isRealRental(rental, info, now);
    const id = String(rental.id || rental.rentalid || rental.rental_id || '').trim();

    if (isValid) {
      result.real.push(rental);
      if (id) realIdSet.add(id);
    } else {
      result.ghost.push(rental);
      if (id) ghostIdSet.add(id);
    }
  }

  result.realIds = Array.from(realIdSet);
  result.ghostIds = Array.from(ghostIdSet);

  return result;
}