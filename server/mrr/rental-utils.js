// ==========================
//  LIB: RENTAL UTILITIES
//  Pure functions with no external dependencies
// ==========================

/**
 * Get rental ID from a rig object
 */
export function getRentalIdFromRig(rig) {
  const candidates = [
    rig?.status?.rentalid,
    rig?.status?.rental_id,
    rig?.status?.rentalId,
    rig?.rentalid,
    rig?.rental_id,
    rig?.rentalId,
    rig?.current_rental_id,
    rig?.currentRentalId,
    rig?.rental?.id,
  ];

  const found = candidates.find(value => 
    value !== undefined && 
    value !== null && 
    String(value).trim() !== '' && 
    String(value).trim() !== '0'
  );
  return found === undefined ? '' : String(found).trim();
}

/**
 * Get lookup keys for a rental
 */
export function getRigLookupKeys(rental, fallbackId = '') {
  return [
    rental?.id,
    rental?.rentalid,
    rental?.rental_id,
    rental?.rentalId,
    rental?.rigid,
    rental?.rig_id,
    rental?.rigId,
    rental?.rig?.id,
    fallbackId,
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

/**
 * Check if rental has inactive status
 */
export function hasInactiveRentalStatus(rental) {
  const statusCandidates = [
    rental?.status,
    rental?.state,
    rental?.rental_status,
    rental?.rentalStatus,
    rental?.rig?.status,
  ];
  
  const status = statusCandidates
    .map(value => String(typeof value === 'object' ? value?.status : value || '').toLowerCase())
    .find(Boolean) || '';

  return ['finished', 'complete', 'completed', 'cancelled', 'canceled', 'expired', 'ended']
    .some(token => status.includes(token));
}

/**
 * Check if rental is active
 */
export function isRentalActive(now, endTs, sourceRig, rental) {
  if (hasInactiveRentalStatus(rental)) return false;
  if (endTs > 0) return now < endTs;

  const statusRaw = sourceRig?.status ?? 
                    rental?.status ?? 
                    rental?.state ?? 
                    rental?.rental_status ?? 
                    rental?.rentalStatus;
                    
  const status = String(typeof statusRaw === 'object' ? statusRaw.status : statusRaw || '').toLowerCase();
  const hasLiveRentalId = Boolean(getRentalIdFromRig(sourceRig));
  const rentedFlag = Boolean(sourceRig?.status?.rented || rental?.status?.rented);

  return rentedFlag || 
         hasLiveRentalId || 
         status.includes('rented') || 
         status.includes('active') || 
         status.includes('running');
}

/**
 * Check if rig is currently rented
 */
export function isLiveRigCurrentlyRented(rig) {
  if (!rig) return false;
  const statusRaw = rig?.status;
  const status = String(typeof statusRaw === 'object' ? statusRaw.status : statusRaw || '').toLowerCase();
  return Boolean(getRentalIdFromRig(rig)) && 
         (status.includes('rented') || status.includes('active') || status.includes('running'));
}

/**
 * Check if rental is finished
 */
export function isRentalFinished(now, endTs, sourceRig) {
  if (endTs > 0) return now >= endTs;

  const statusRaw = sourceRig?.status;
  const status = String(typeof statusRaw === 'object' ? statusRaw.status : statusRaw || '').toLowerCase();
  const hasLiveRentalId = Boolean(getRentalIdFromRig(sourceRig));
  const rentedFlag = Boolean(sourceRig?.status?.rented);

  return !(rentedFlag || hasLiveRentalId || status.includes('rented') || status.includes('active'));
}

/**
 * Resolve rental algorithm
 */
export function resolveRentalAlgo(r, info) {
  return info?.algo || 
         r?.algo || 
         r?.algorithm || 
         r?.miningAlgorithm || 
         r?.rig?.type || 
         r?.rig?.algo || 
         r?.type || 
         'N/A';
}

/**
 * Parse UTC date string
 */
export function parseUtcDate(d) {
  if (!d) return 0;
  const s = String(d);
  const hasSuffix = s.endsWith('UTC') || s.endsWith('Z') || s.includes('+');
  return new Date(hasSuffix ? s : s + ' UTC').getTime();
}