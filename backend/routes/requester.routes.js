const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sanitizeInput, sanitizeForLog } = require('../utils/sanitization');
const { isEmail: validateEmailFormat } = require('../utils/validation');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get requesters for a task list
router.get('/task-lists/:id/requesters', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM requesters WHERE task_list_id = $1 ORDER BY name',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requesters' });
  }
});

// Create requester
router.post('/task-lists/:id/requesters', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Requester name is required' });
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email ? sanitizeInput(email) : null;

    if (sanitizedEmail && !validateEmailFormat(sanitizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const result = await pool.query(
      'INSERT INTO requesters (name, email, task_list_id) VALUES ($1, $2, $3) RETURNING *',
      [sanitizedName, sanitizedEmail, id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create requester' });
  }
});

// Delete requester
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    logger.debug('Deleting requester', { requesterId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });

    const requesterCheck = await pool.query(
      'SELECT r.*, tl.owner_id FROM requesters r JOIN task_lists tl ON r.task_list_id = tl.id WHERE r.id = $1',
      [id]
    );

    if (requesterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Requester not found' });
    }

    const requester = requesterCheck.rows[0];

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [requester.task_list_id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM requesters WHERE id = $1', [id]);
    logger.info('Requester deleted', { requesterId: sanitizeForLog(id) });

    res.json({ message: 'Requester deleted successfully' });
  } catch (error) {
    logger.error('Delete requester error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete requester' });
  }
});

module.exports = router;
