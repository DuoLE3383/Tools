// ==========================
//  LIB: ARRAY UTILITIES
//  Pure array manipulation functions
// ==========================

/**
 * Extract array from nested object
 */
export function extractArray(payload, keys = ['rentals', 'rigs', 'list', 'result', 'items', 'data']) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
  }

  if (Array.isArray(payload.data)) return payload.data;
  if (payload.rentals && Array.isArray(payload.rentals)) return payload.rentals;

  if (payload.data && typeof payload.data === 'object') {
    return extractArray(payload.data, keys);
  }

  return [];
}

/**
 * Deduplicate array by key
 */
export function deduplicateByKey(array, key) {
  if (!Array.isArray(array)) return [];
  const seen = new Map();
  return array.filter(item => {
    const value = item?.[key];
    if (value === undefined || value === null) return false;
    if (seen.has(value)) return false;
    seen.set(value, true);
    return true;
  });
}

/**
 * Group array by key
 */
export function groupBy(array, key) {
  if (!Array.isArray(array)) return new Map();
  return array.reduce((groups, item) => {
    const value = item?.[key] ?? 'unknown';
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
    return groups;
  }, new Map());
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray(array, size) {
  if (!Array.isArray(array)) return [];
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}