const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

const router = express.Router();

// Get notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    logger.debug('Getting notifications', { userId: sanitizeForLog(req.user.userId) });

    const result = await pool.query(`
      SELECT n.*, t.name as task_name, tl.name as task_list_name
      FROM notifications n
      LEFT JOIN tasks t ON n.task_id = t.id
      LEFT JOIN task_lists tl ON n.task_list_id = tl.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [req.user.userId]);

    const notifications = result.rows.map(notification => ({
      ...notification,
      created_at: new Date(notification.created_at).toISOString()
    }));

    res.json(notifications);
  } catch (error) {
    logger.error('Get notifications error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = FALSE',
      [req.user.userId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    logger.error('Get unread count error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Mark notification read error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all as read
router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
      [req.user.userId]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all read error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Clear all notifications
router.delete('/clear-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE user_id = $1',
      [req.user.userId]
    );

    res.json({ message: 'All notifications cleared' });
  } catch (error) {
    logger.error('Clear all notifications error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to clear all notifications' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    logger.error('Delete notification error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
