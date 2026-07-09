import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import express from 'express';
import { randomUUID } from 'crypto';
import { getDb } from './db.js';

// ---------- Configuration ----------
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
const AUTH_EPOCH_KEY = 'auth_epoch';

// ---------- Roles and Permissions ----------

export const ROLES = {
  USER: 'user',
  MINER_VIEWER: 'miner_viewer',
  MRR_VIEWER: 'mrr_viewer',
  ADMIN: 'admin',
};

const roleHierarchy = {
  [ROLES.USER]: 0,
  [ROLES.MINER_VIEWER]: 1,
  [ROLES.MRR_VIEWER]: 2,
  [ROLES.ADMIN]: 3,
};

export const PERMISSIONS = {
  [ROLES.ADMIN]: ['dashboard', 'mining', 'miner', 'nicehash', 'mrr', 'orders', 'cryptorate', 'users'],
  [ROLES.MRR_VIEWER]: ['dashboard', 'mrr'],
  [ROLES.MINER_VIEWER]: ['dashboard', 'mining'],
  [ROLES.USER]: ['dashboard', 'cryptorate'],
};

const VALID_ROLES = new Set(Object.keys(PERMISSIONS));
const DEFAULT_ADMIN_ROLE = ROLES.ADMIN;
const DEFAULT_USER_ROLE = ROLES.USER;
const PUBLIC_API_PATHS = [
  '/api/auth/login',
  '/api/v2/time',
  '/api/v2/prices/coingecko',
  '/api/v2/prices/ws',
  '/api/v2/mining-stats',
];

if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not defined.');
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

/**
 * Validates essential authentication configuration from environment variables.
 * Throws an error if critical configuration is missing.
 */
export function validateAuthConfig() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables. Authentication will fail.');
  }
}

export async function initAuthStore() {
  const db = await getDb();
  if (!db) return; // Should not happen if getDb is correct
  await db.run(`CREATE TABLE IF NOT EXISTS auth_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS auth_users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS auth_sessions (
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
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  const row = await db.get(`SELECT value FROM auth_state WHERE key = ?`, [AUTH_EPOCH_KEY]);
  const current = Number.parseInt(row?.value || '0', 10);
  return Number.isFinite(current) ? current : 0;
}

async function setAuthEpoch(value) {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  await db.run(
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

  const db = await getDb();
  const existing = await db.get(`SELECT username FROM auth_users WHERE username = ?`, [adminUsername]);
  if (existing) return;

  const passwordHash = adminPassword.startsWith('$2')
    ? adminPassword
    : await hashPassword(adminPassword);

  const now = Date.now();
  await db.run(
    `INSERT INTO auth_users (username, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [adminUsername, passwordHash, DEFAULT_ADMIN_ROLE, now, now],
  );
  console.log(`[auth] Bootstrap admin user seeded: ${adminUsername}`);
}

async function getUserByUsername(username) {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  return db.get(`SELECT * FROM auth_users WHERE username = ? LIMIT 1`, [normalizeUsername(username)]);
}

async function listUsers() {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  return db.all(
    `SELECT username, role, active, created_at, updated_at
     FROM auth_users
     ORDER BY role DESC, username ASC`,
  );
}

async function createUser({ username, password, role = DEFAULT_USER_ROLE }) {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
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

  let finalRole = String(role || DEFAULT_USER_ROLE).trim().toLowerCase();
  if (!VALID_ROLES.has(finalRole)) {
    console.warn(`[auth] Invalid role "${finalRole}" provided for user "${safeUsername}". Defaulting to "${DEFAULT_USER_ROLE}".`);
    finalRole = DEFAULT_USER_ROLE;
  }

  const existing = await getUserByUsername(safeUsername);
  if (existing) {
    const err = new Error(`User "${safeUsername}" already exists.`);
    err.statusCode = 409;
    throw err;
  }

  const now = Date.now();
  const passwordHash = await hashPassword(String(password));
  await db.run(
    `INSERT INTO auth_users (username, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [safeUsername, passwordHash, finalRole, now, now],
  );

  return { username: safeUsername, role: finalRole, active: 1, created_at: now, updated_at: now };
}

export async function invalidateAllSessions(reason = 'startup') {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  const nextEpoch = (await getAuthEpoch()) + 1;
  await setAuthEpoch(nextEpoch);
  await db.run(`DELETE FROM auth_sessions`);
  console.log(`[auth] Invalidated all sessions (${reason}); auth_epoch=${nextEpoch}`);
  return nextEpoch;
}

async function saveSession({ username, sessionId, tokenJti, expiresAt, userAgent, ip }) {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  const now = Date.now();
  await db.run(
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
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  return db.get(
    `SELECT * FROM auth_sessions WHERE username = ? AND active = 1 LIMIT 1`,
    [username],
  );
}

async function touchSession(username, sessionId) {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
  await db.run(
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

export const hasAccess = (userRole, requiredRole) => {
  if (!userRole || !requiredRole) return false;
  const userLevel = roleHierarchy[userRole];
  const requiredLevel = roleHierarchy[requiredRole];
  if (userLevel === undefined || requiredLevel === undefined) {
    return false;
  }
  return userLevel >= requiredLevel;
};

export const requireAdmin = (req, res, next) => {
  if (!hasAccess(req.user?.role, ROLES.ADMIN)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  next();
};

export const requireRole = (requiredRole) => (req, res, next) => {
  if (!hasAccess(req.user?.role, requiredRole)) {
    return res.status(403).json({ success: false, error: `Access denied. Requires '${requiredRole}' role or higher.` });
  }
  next();
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(403).json({ success: false, error: 'Access denied. No role assigned.' });
    }
    const userPermissions = PERMISSIONS[userRole];
    if (!userPermissions || !userPermissions.includes(permission)) {
      return res.status(403).json({ success: false, error: `Access denied. Requires '${permission}' permission.` });
    }
    next();
  };
};

export const hashPassword = async (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash);

async function issueTokenForUser(username, req) {
  const db = await getDb();
  await initAuthStore(); // Ensures tables exist
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

// export function validateAuthConfig() {
//   if (!process.env.JWT_SECRET) {
//     throw new Error('JWT_SECRET is not defined in environment variables. Authentication will fail.');
//   }
// }

// ---------- Default Router (mountable) ----------
const router = express.Router();

// Login route (using the utilities above)
router.post('/login', (req, res, next) => { next(); }, async (req, res) => {
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
    const db = await getDb();
    await initAuthStore(); // Ensures tables exist
    if (req.user?.username) {
      await db.run(`UPDATE auth_sessions SET active = 0 WHERE username = ?`, [req.user.username]);
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

router.get('/permissions', authMiddleware, (req, res) => {
  const userRole = req.user?.role || 'user';
  const userPermissions = PERMISSIONS[userRole] || PERMISSIONS.user;
  res.json({
    success: true,
    role: userRole,
    permissions: userPermissions,
    // For admin UI to see all roles and permissions
    allRoles: req.user?.role === 'admin' ? Array.from(VALID_ROLES) : undefined,
    allPermissions: req.user?.role === 'admin' ? PERMISSIONS : undefined,
  });
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

router.put('/users/:username/role', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const role = String(req.body?.role || '').trim().toLowerCase().replace(/\s+/g, '_');

    // Ensure the role is one of the predefined valid roles
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ success: false, error: `Invalid role specified. Must be one of: ${Array.from(VALID_ROLES).join(', ')}` });
    }

    const db = await getDb();
    const result = await db.run(
      `UPDATE auth_users SET role = ?, updated_at = ? WHERE username = ?`,
      [role, Date.now(), normalizeUsername(username)],
    );

    if (!result.changes) {
      return res.status(404).json({ success: false, error: `User "${username}" not found.` });
    }

    await invalidateAllSessions(`role change for ${username}`);
    res.json({ success: true, username, role });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to update user role.' });
  }
});

router.put('/users/:username/disable', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    const db = await getDb();
    await initAuthStore(); // Ensures tables exist
    const result = await db.run(
      `UPDATE auth_users SET active = 0, updated_at = ? WHERE username = ?`,
      [Date.now(), username],
    );
    if (!result.changes) {
      return res.status(404).json({ success: false, error: `User "${username}" not found.` });
    }
    await db.run(`UPDATE auth_sessions SET active = 0 WHERE username = ?`, [username]);
    res.json({ success: true, username });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to disable user.' });
  }
});

// Export the router as default
export default router;
