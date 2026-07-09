// server/routes/users.js
import express from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js'; // Your database connection

const router = express.Router();

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  const userRole = req.user?.role || 'user';
  if (userRole !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required' 
    });
  }
  next();
};

// GET all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await db.all(
      'SELECT username, role, active, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;

  // Validate role
  const validRoles = ['admin', 'mrr_viewer', 'miner_viewer', 'user'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: `Invalid role specified. Must be one of: ${validRoles.join(', ')}`
    });
  }

  if (!username || username.length < 3) {
    return res.status(400).json({
      success: false,
      error: 'Username must be at least 3 characters'
    });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters'
    });
  }

  try {
    // Check if username exists
    const existing = await db.get(
      'SELECT username FROM users WHERE username = ?',
      [username]
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const now = Date.now();

    await db.run(
      `INSERT INTO users (id, username, password, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [userId, username, hashedPassword, role, now, now]
    );

    res.json({
      success: true,
      user: { username, role, active: 1 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT enable/disable user (admin only)
router.put('/:username/disable', requireAdmin, async (req, res) => {
  const { username } = req.params;
  
  try {
    await db.run(
      'UPDATE users SET active = 0, updated_at = ? WHERE username = ?',
      [Date.now(), username]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:username/enable', requireAdmin, async (req, res) => {
  const { username } = req.params;
  
  try {
    await db.run(
      'UPDATE users SET active = 1, updated_at = ? WHERE username = ?',
      [Date.now(), username]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT change user role (admin only)
router.put('/:username/role', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { role } = req.body;

  const validRoles = ['admin', 'mrr_viewer', 'miner_viewer', 'user'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: `Invalid role specified. Must be one of: ${validRoles.join(', ')}`
    });
  }

  try {
    await db.run(
      'UPDATE users SET role = ?, updated_at = ? WHERE username = ?',
      [role, Date.now(), username]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE user (admin only)
router.delete('/:username', requireAdmin, async (req, res) => {
  const { username } = req.params;
  
  try {
    // Don't allow deleting the main admin user
    if (username === 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the main admin user'
      });
    }

    await db.run('DELETE FROM users WHERE username = ?', [username]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;