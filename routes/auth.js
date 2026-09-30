const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, logActivity } = require('../database');
const { signToken, authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logActivity(req, 'LOGIN_FAILED', `Failed login attempt for "${String(username).toLowerCase().trim()}"`, {
      username: String(username).toLowerCase().trim()
    });
    return res.status(401).json({ error: 'Invalid credentials. Access denied.' });
  }

  const token = signToken(user);
  logActivity(req, 'LOGIN', 'Session established', { user });

  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      callsign: user.callsign,
      role: user.role
    }
  });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      logActivity(req, 'LOGOUT', 'Session terminated');
    } catch {
      /* expired sessions still clear */
    }
  }
  res.clearCookie('token');
  res.json({ message: 'Session terminated.' });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, display_name, callsign, role, created_at FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    callsign: user.callsign,
    role: user.role,
    createdAt: user.created_at
  });
});

module.exports = router;
