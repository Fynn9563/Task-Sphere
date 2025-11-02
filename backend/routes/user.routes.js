const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validatePassword } = require('../services/auth.service');
const { sanitizeInput, sanitizeForLog } = require('../utils/sanitization');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, dark_mode_preference, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get profile error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, avatarUrl, darkModePreference } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (!name || name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({ error: 'Name must be between 1 and 100 characters' });
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(sanitizeInput(name.trim()));
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl && (typeof avatarUrl !== 'string' || avatarUrl.length > 500)) {
        return res.status(400).json({ error: 'Avatar URL must be a valid string under 500 characters' });
      }
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatarUrl || null);
    }

    if (darkModePreference !== undefined) {
      if (typeof darkModePreference !== 'boolean') {
        return res.status(400).json({ error: 'Dark mode preference must be a boolean' });
      }
      updates.push(`dark_mode_preference = $${paramIndex++}`);
      values.push(darkModePreference);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.user.userId);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, dark_mode_preference, avatar_url, created_at`,
      values
    );

    logger.info('Profile updated', { userId: sanitizeForLog(req.user.userId) });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update profile error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const user = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.userId]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.userId]
    );

    logger.info('Password changed', { userId: sanitizeForLog(req.user.userId) });
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Change password error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
