const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticateToken } = require('../middleware/auth');
const { validatePassword, generateTokens } = require('../services/auth.service');
const { sanitizeInput } = require('../utils/sanitization');
const { isEmail: validateEmailFormat } = require('../utils/validation');
const { logger, securityLog, trackFailedLogin, resetFailedLoginAttempts } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

const router = express.Router();

// Register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || typeof email !== 'string' || email.length === 0 ||
        !password || typeof password !== 'string' || password.length === 0 ||
        !name || typeof name !== 'string' || name.length === 0) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!validateEmailFormat(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const sanitizedEmail = sanitizeInput(email.toLowerCase());
    const sanitizedName = sanitizeInput(name);

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [sanitizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [sanitizedEmail, passwordHash, sanitizedName]
    );

    const user = result.rows[0];
    logger.info('User registered', { userId: sanitizeForLog(user.id), email: sanitizeForLog(user.email) });

    const { accessToken, refreshToken } = generateTokens(user.id);
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    res.status(201).json({
      user,
      token: accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('Registration error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || email.length === 0 ||
        !password || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const sanitizedEmail = sanitizeInput(email.toLowerCase());

    const lockStatus = trackFailedLogin(sanitizedEmail);
    if (lockStatus.locked) {
      securityLog('LOGIN_BLOCKED', {
        email: sanitizedEmail,
        reason: 'Account temporarily locked',
        remainingMinutes: lockStatus.remainingMinutes
      }, req);
      return res.status(429).json({ error: lockStatus.message });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [sanitizedEmail]);
    const user = result.rows[0];

    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      const failedStatus = trackFailedLogin(sanitizedEmail);
      securityLog('LOGIN_FAILURE', {
        email: sanitizedEmail,
        reason: 'Invalid credentials',
        attemptCount: failedStatus.attemptCount,
        remainingAttempts: failedStatus.remainingAttempts
      }, req);

      if (failedStatus.locked) {
        return res.status(429).json({ error: failedStatus.message });
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        remainingAttempts: failedStatus.remainingAttempts
      });
    }

    resetFailedLoginAttempts(sanitizedEmail);
    logger.info('User Login Success', { userId: user.id, email: sanitizedEmail, requestId: req.id });
    securityLog('LOGIN_SUCCESS', { userId: user.id, email: sanitizedEmail }, req);

    const { accessToken, refreshToken } = generateTokens(user.id);
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token: accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('Login Error', { error: error.message, stack: error.stack, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    logger.debug('Refresh token decoded', { userId: sanitizeForLog(decoded.userId) });

    const user = await pool.query('SELECT * FROM users WHERE id = $1 AND refresh_token = $2',
      [decoded.userId, refreshToken]);

    if (user.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2',
      [newRefreshToken, decoded.userId]);

    res.json({
      token: accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    logger.error('Token refresh error', { error: sanitizeForLog(error.message) });
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// Debug auth endpoint
router.get('/debug/auth', authenticateToken, (req, res) => {
  res.json({
    message: 'Auth working',
    user: req.user,
    userId: req.user.userId
  });
});

module.exports = router;
