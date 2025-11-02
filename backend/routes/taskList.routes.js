const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { generateInviteCode } = require('../services/inviteCode.service');
const { sanitizeInput, sanitizeForLog } = require('../utils/sanitization');
const { schemas } = require('../models/schemas');
const { logger, securityLog } = require('../utils/logger');

const router = express.Router();

// Get all task lists for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    logger.debug('Getting task lists', { userId: sanitizeForLog(req.user.userId) });

    const result = await pool.query(`
      SELECT tl.*, u.name as owner_name,
             COUNT(DISTINCT CASE WHEN tlm.user_id IS NOT NULL THEN tlm.user_id END) as member_count,
             COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN t.id END) as task_count
      FROM task_lists tl
      LEFT JOIN users u ON tl.owner_id = u.id
      LEFT JOIN task_list_members tlm ON tl.id = tlm.task_list_id
      LEFT JOIN tasks t ON tl.id = t.task_list_id
      WHERE tl.owner_id = $1 OR tl.id IN (
        SELECT task_list_id FROM task_list_members WHERE user_id = $1
      )
      GROUP BY tl.id, u.name
      ORDER BY tl.created_at DESC
    `, [req.user.userId]);

    logger.debug('Found task lists', { count: result.rows.length, userId: sanitizeForLog(req.user.userId) });

    res.json(result.rows);
  } catch (error) {
    logger.error('Get task lists error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to fetch task lists' });
  }
});

// Create task list
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    const { error } = schemas.taskList.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      return res.status(400).json({ error: errorMessage });
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : null;
    const inviteCode = generateInviteCode();

    logger.debug('Creating task list', { userId: sanitizeForLog(req.user.userId), name: sanitizeForLog(sanitizedName) });

    const result = await pool.query(
      'INSERT INTO task_lists (name, description, owner_id, invite_code) VALUES ($1, $2, $3, $4) RETURNING *',
      [sanitizedName, sanitizedDescription, req.user.userId, inviteCode]
    );

    const taskListId = result.rows[0].id;
    logger.debug('Task list created', { taskListId: sanitizeForLog(taskListId), userId: sanitizeForLog(req.user.userId) });

    await pool.query(
      'INSERT INTO task_list_members (task_list_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
      [taskListId, req.user.userId, 'owner']
    );

    logger.debug('Member added to task list', { taskListId: sanitizeForLog(taskListId), userId: sanitizeForLog(req.user.userId) });

    const enrichedResult = await pool.query(`
      SELECT tl.*, u.name as owner_name,
             COUNT(DISTINCT CASE WHEN tlm.user_id IS NOT NULL THEN tlm.user_id END) as member_count,
             COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN t.id END) as task_count
      FROM task_lists tl
      LEFT JOIN users u ON tl.owner_id = u.id
      LEFT JOIN task_list_members tlm ON tl.id = tlm.task_list_id
      LEFT JOIN tasks t ON tl.id = t.task_list_id
      WHERE tl.id = $1
      GROUP BY tl.id, u.name
    `, [taskListId]);

    logger.debug('Task list enriched with owner data', { taskListId: sanitizeForLog(taskListId) });

    res.status(201).json(enrichedResult.rows[0]);
  } catch (error) {
    logger.error('Create task list error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to create task list' });
  }
});

// Delete task list
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    logger.debug('Deleting task list', { taskListId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });

    const ownerCheck = await pool.query(
      'SELECT id, owner_id FROM task_lists WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    const taskList = ownerCheck.rows[0];

    if (taskList.owner_id !== req.user.userId) {
      securityLog('ACCESS_DENIED', {
        reason: 'Non-owner attempted to delete task list',
        taskListId: id,
        ownerId: taskList.owner_id
      }, req);
      return res.status(403).json({ error: 'Only the owner can delete this task list' });
    }

    await pool.query('DELETE FROM task_lists WHERE id = $1', [id]);

    logger.info('Task list deleted', { taskListId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });
    securityLog('TASK_LIST_DELETED', { taskListId: id }, req);

    res.json({ message: 'Task list deleted successfully' });
  } catch (error) {
    logger.error('Delete task list error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to delete task list' });
  }
});

// Join task list with invite code
router.post('/join', authenticateToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    logger.debug('User joining task list', { userId: sanitizeForLog(req.user.userId), inviteCode: sanitizeForLog(inviteCode) });

    const sanitizedCode = sanitizeInput(inviteCode.toUpperCase());

    const taskListResult = await pool.query(
      'SELECT * FROM task_lists WHERE invite_code = $1',
      [sanitizedCode]
    );

    if (taskListResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    const taskList = taskListResult.rows[0];

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [taskList.id, req.user.userId]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Already a member of this task list' });
    }

    await pool.query(
      'INSERT INTO task_list_members (task_list_id, user_id) VALUES ($1, $2)',
      [taskList.id, req.user.userId]
    );

    logger.info('User joined task list', { userId: sanitizeForLog(req.user.userId), taskListId: sanitizeForLog(taskList.id) });

    res.json({ message: 'Successfully joined task list', taskList });
  } catch (error) {
    logger.error('Join task list error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to join task list' });
  }
});

// Get members of a task list
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url, tlm.role, tlm.joined_at
      FROM task_list_members tlm
      JOIN users u ON tlm.user_id = u.id
      WHERE tlm.task_list_id = $1
      ORDER BY tlm.joined_at ASC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    logger.error('Get members error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

module.exports = router;
