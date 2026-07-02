// server/utils.js - Minimal version
export function normalizeCredential(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function sanitizeMrrEndpoint(endpoint) {
  // Ensure endpoint starts with /
  if (!endpoint) return '/';
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}

// Add any other utility functions needed