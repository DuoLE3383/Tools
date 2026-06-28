import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import express from 'express';
import { randomUUID } from 'crypto';
import { db } from './db.js';

// ---------- Configuration ----------
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
const AUTH_EPOCH_KEY = 'auth_epoch';
const DEFAULT_ADMIN_ROLE = 'admin';
const DEFAULT_USER_ROLE = 'user';
const PUBLIC_API_PATHS = [
  '/api/v2/time',
  '/api/v2/prices/coingecko',
  '/api/v2/prices/ws',
  '/api/v2/mining-stats',
];

if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not defined.');
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getExpiresInMs() {
  const raw = String(JWT_EXPIRES_IN).trim();
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] || 60 * 60 * 1000);
}

export async function initAuthStore() {
  if (!db) return;
  await dbRun(`CREATE TABLE IF NOT EXISTS auth_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS auth_users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS auth_sessions (
    username TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    token_jti TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    last_seen INTEGER NOT NULL DEFAULT 0,
    user_agent TEXT,
    ip TEXT
  )`);
  await ensureBootstrapAdminUser();
}

async function getAuthEpoch() {
  await initAuthStore();
  const row = await dbGet(`SELECT value FROM auth_state WHERE key = ?`, [AUTH_EPOCH_KEY]);
  const current = Number.parseInt(row?.value || '0', 10);
  return Number.isFinite(current) ? current : 0;
}

async function setAuthEpoch(value) {
  await initAuthStore();
  await dbRun(
    `INSERT INTO auth_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [AUTH_EPOCH_KEY, String(value)],
  );
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

function getBootstrapAdminUsername() {
  return normalizeUsername(process.env.ADMIN_USER);
}

function getBootstrapAdminPassword() {
  return String(process.env.ADMIN_PASS || '').trim();
}

async function ensureBootstrapAdminUser() {
  const adminUsername = getBootstrapAdminUsername();
  const adminPassword = getBootstrapAdminPassword();
  if (!adminUsername || !adminPassword) return;

  const existing = await dbGet(`SELECT username FROM auth_users WHERE username = ?`, [adminUsername]);
  if (existing) return;

  const passwordHash = adminPassword.startsWith('$2')
    ? adminPassword
    : await hashPassword(adminPassword);

  const now = Date.now();
  await dbRun(
    `INSERT INTO auth_users (username, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [adminUsername, passwordHash, DEFAULT_ADMIN_ROLE, now, now],
  );
  console.log(`[auth] Bootstrap admin user seeded: ${adminUsername}`);
}

async function getUserByUsername(username) {
  await initAuthStore();
  return dbGet(`SELECT * FROM auth_users WHERE username = ? LIMIT 1`, [normalizeUsername(username)]);
}

async function listUsers() {
  await initAuthStore();
  return dbAll(
    `SELECT username, role, active, created_at, updated_at
     FROM auth_users
     ORDER BY role DESC, username ASC`,
  );
}

async function createUser({ username, password, role = DEFAULT_USER_ROLE }) {
  await initAuthStore();
  const safeUsername = normalizeUsername(username);
  if (!safeUsername) {
    const err = new Error('Username is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!password || String(password).length < 8) {
    const err = new Error('Password must be at least 8 characters.');
    err.statusCode = 400;
    throw err;
  }

  const normalizedRole = String(role || DEFAULT_USER_ROLE).trim().toLowerCase();
  const finalRole = normalizedRole === 'admin' ? DEFAULT_ADMIN_ROLE : DEFAULT_USER_ROLE;
  const existing = await getUserByUsername(safeUsername);
  if (existing) {
    const err = new Error(`User "${safeUsername}" already exists.`);
    err.statusCode = 409;
    throw err;
  }

  const now = Date.now();
  const passwordHash = await hashPassword(String(password));
  await dbRun(
    `INSERT INTO auth_users (username, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [safeUsername, passwordHash, finalRole, now, now],
  );

  return { username: safeUsername, role: finalRole, active: 1, created_at: now, updated_at: now };
}

export async function invalidateAllSessions(reason = 'startup') {
  await initAuthStore();
  const nextEpoch = (await getAuthEpoch()) + 1;
  await setAuthEpoch(nextEpoch);
  await dbRun(`DELETE FROM auth_sessions`);
  console.log(`[auth] Invalidated all sessions (${reason}); auth_epoch=${nextEpoch}`);
  return nextEpoch;
}

async function saveSession({ username, sessionId, tokenJti, expiresAt, userAgent, ip }) {
  await initAuthStore();
  const now = Date.now();
  await dbRun(
    `INSERT INTO auth_sessions (
      username, session_id, token_jti, issued_at, expires_at, active, last_seen, user_agent, ip
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      session_id = excluded.session_id,
      token_jti = excluded.token_jti,
      issued_at = excluded.issued_at,
      expires_at = excluded.expires_at,
      active = 1,
      last_seen = excluded.last_seen,
      user_agent = excluded.user_agent,
      ip = excluded.ip`,
    [username, sessionId, tokenJti, now, expiresAt, now, userAgent || '', ip || ''],
  );
}

async function getActiveSession(username) {
  await initAuthStore();
  return dbGet(
    `SELECT * FROM auth_sessions WHERE username = ? AND active = 1 LIMIT 1`,
    [username],
  );
}

async function touchSession(username, sessionId) {
  await initAuthStore();
  await dbRun(
    `UPDATE auth_sessions SET last_seen = ? WHERE username = ? AND session_id = ? AND active = 1`,
    [Date.now(), username, sessionId],
  );
}

// ---------- Utility exports ----------
export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = async (token, reqMeta = {}) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.username || !decoded?.sid || !decoded?.jti) return null;

    const currentEpoch = await getAuthEpoch();
    if (Number(decoded.epoch) !== Number(currentEpoch)) return null;

    const session = await getActiveSession(decoded.username);
    if (!session) return null;
    if (session.session_id !== decoded.sid) return null;
    if (session.token_jti !== decoded.jti) return null;

    const now = Date.now();
    if (Number(session.expires_at || 0) > 0 && now > Number(session.expires_at)) return null;

    await touchSession(decoded.username, decoded.sid).catch(() => {});
    return decoded;
  } catch {
    return null;
  }
};

export const authMiddleware = (req, res, next) => {
  const requestPath = String(req.originalUrl || req.url || '').split('?')[0];
  if (PUBLIC_API_PATHS.some((prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`))) {
    return next();
  }

  let token = '';
  const authHeader = req.headers?.authorization;

  // 1. Check Authorization Header (Bearer Token)
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Fallback to Query Parameter (essential for WebSocket handshakes)
  if (!token && req.query?.token) {
    token = String(req.query.token);
  } else if (!token && req.url && req.url.includes('token=')) {
    // Robust manual extraction if req.query isn't populated yet during upgrade
    const match = req.url.match(/[?&]token=([^&]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided.' });
  }

  Promise.resolve(verifyToken(token, { ip: req.ip, userAgent: req.headers?.['user-agent'] }))
    .then((decoded) => {
      if (!decoded) {
        return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
      }
      req.user = decoded;
      next();
    })
    .catch(() => {
      return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
  });
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== DEFAULT_ADMIN_ROLE) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  next();
};

export const hashPassword = async (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash);

async function issueTokenForUser(username, req) {
  await initAuthStore();
  const user = await getUserByUsername(username);
  if (!user) {
    const err = new Error(`User "${username}" not found.`);
    err.statusCode = 401;
    throw err;
  }
  const sessionId = randomUUID();
  const jti = randomUUID();
  const epoch = await getAuthEpoch();
  const expiresAt = Date.now() + getExpiresInMs();

  await saveSession({
    username,
    sessionId,
    tokenJti: jti,
    expiresAt,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  return generateToken({ username, sid: sessionId, jti, epoch, role: user.role || DEFAULT_USER_ROLE });
}

// ---------- Default Router (mountable) ----------
const router = express.Router();

// Login route (using the utilities above)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required.' });
    }

    const user = await getUserByUsername(username);
    if (!user || Number(user.active) !== 1) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const token = await issueTokenForUser(user.username, req);
    res.json({ success: true, token });
  } catch (error) {
    console.error('❌ Login Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error during login.' });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await initAuthStore();
    if (req.user?.username) {
      await dbRun(`UPDATE auth_sessions SET active = 0 WHERE username = ?`, [req.user.username]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to logout.' });
  }
});

// Example protected route â€“ you can also mount it separately
router.get('/profile', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await listUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to list users.' });
  }
});

router.post('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const created = await createUser(req.body || {});
    res.status(201).json({ success: true, user: created });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to create user.' });
  }
});

router.put('/users/:username/disable', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    await initAuthStore();
    const result = await dbRun(
      `UPDATE auth_users SET active = 0, updated_at = ? WHERE username = ?`,
      [Date.now(), username],
    );
    if (!result.changes) {
      return res.status(404).json({ success: false, error: `User "${username}" not found.` });
    }
    await dbRun(`UPDATE auth_sessions SET active = 0 WHERE username = ?`, [username]);
    res.json({ success: true, username });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to disable user.' });
  }
});

// Export the router as default
export default router;
