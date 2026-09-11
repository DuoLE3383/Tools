// server/ports.js
//
// Single source of truth for the ports this app listens on.
//
// Why this file exists: the backend port used to be hardcoded as a literal in
// several places (start.js, index.js, vite.config.js, the self-request helpers)
// with *different* defaults -- 3003 in some, 3000 in others. That drift is what
// let `cloudflared tunnel --url http://localhost:3000` run against a backend
// that was actually listening on 3003, so every request was refused.
//
// This module is intentionally dependency-free (no node builtins) so it can be
// imported from Node scripts and from vite.config.js alike.

export const DEFAULT_BACKEND_PORT = 3003;
export const DEFAULT_FRONTEND_PORT = 1757;

export const BACKEND_PORT_ENV = 'PORT';
export const FRONTEND_PORT_ENV = 'VITE_PORT';

/**
 * Parse a port from an untrusted value (env var, CLI arg, JSON file).
 * @returns {number|null} a valid TCP port, or null when the value is unusable.
 */
export function normalizePort(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return null;
  return parsed;
}

/**
 * The backend port to bind. Never returns 3000-by-accident again: an invalid or
 * missing PORT falls back to DEFAULT_BACKEND_PORT.
 */
export function resolveBackendPort(env = process.env) {
  return normalizePort(env?.[BACKEND_PORT_ENV]) ?? DEFAULT_BACKEND_PORT;
}

/**
 * The Vite dev-server port.
 */
export function resolveFrontendPort(env = process.env) {
  return normalizePort(env?.[FRONTEND_PORT_ENV]) ?? DEFAULT_FRONTEND_PORT;
}

/**
 * Base URL for server-to-server (self) requests against this same backend.
 * @param {string} host - 'localhost' for local loops, '127.0.0.1' to skip the
 *   IPv6 ::1 resolution that some tools get wrong.
 */
export function getBackendBaseUrl(env = process.env, host = 'localhost') {
  return `http://${host}:${resolveBackendPort(env)}`;
}
