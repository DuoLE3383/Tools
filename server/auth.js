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

export const hashPassword = async (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash);

async function issueTokenForUser(username, req) {
  await initAuthStore();
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

  return generateToken({ username, sid: sessionId, jti, epoch });
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

    const expectedUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;

    if (!expectedUser || !adminPass) {
      console.error('❌ Login Failed: ADMIN_USER or ADMIN_PASS is undefined in process.env');
      return res.status(500).json({ success: false, error: 'Server configuration error: Authentication credentials are not set.' });
    }

    if (username !== expectedUser) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Support both plain text and bcrypt hashes for convenience
    let isValid = false;
    if (adminPass.startsWith('$2')) {
      isValid = await verifyPassword(password, adminPass);
    } else {
      isValid = (password === adminPass);
    }

    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const token = await issueTokenForUser(username, req);
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
router.get('/profile', (req, res) => {
  res.json({ user: req.user });
});

// Export the router as default
export default router;
