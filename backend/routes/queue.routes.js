const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { queueLimiter } = require('../middleware/rateLimiter');
const { logger, securityLog } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

const router = express.Router();

// Get user's task queue
router.get('/:userId/queue', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskListId } = req.query;

    if (parseInt(userId) !== req.user.userId) {
      securityLog('ACCESS_DENIED', {
        reason: 'User attempting to access another user\'s queue',
        requestedUserId: userId,
        actualUserId: req.user.userId
      }, req);
      return res.status(403).json({ error: 'Access denied' });
    }

    if (taskListId) {
      const memberCheck = await pool.query(
        'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
        [taskListId, req.user.userId]
      );

      if (memberCheck.rows.length === 0) {
        securityLog('ACCESS_DENIED', {
          reason: 'User not a member of requested task list',
          taskListId,
          userId: req.user.userId
        }, req);
        return res.status(403).json({ error: 'Access denied - not a member of this task list' });
      }
    }

    let query, params;
    if (taskListId) {
      query = `
        SELECT t.*, p.name as project_name, r.name as requester_name,
               assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
               assigned_user.avatar_url as assigned_to_avatar_url,
               creator.name as created_by_name,
               utq.queue_position, utq.added_at as queued_at
        FROM user_task_queue utq
        JOIN tasks t ON utq.task_id = t.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN requesters r ON t.requester_id = r.id
        LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
        LEFT JOIN users creator ON t.created_by = creator.id
        WHERE utq.user_id = $1 AND t.task_list_id = $2
        ORDER BY utq.queue_position ASC
      `;
      params = [userId, taskListId];
    } else {
      query = `
        SELECT t.*, p.name as project_name, r.name as requester_name,
               assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
               assigned_user.avatar_url as assigned_to_avatar_url,
               creator.name as created_by_name,
               utq.queue_position, utq.added_at as queued_at
        FROM user_task_queue utq
        JOIN tasks t ON utq.task_id = t.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN requesters r ON t.requester_id = r.id
        LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
        LEFT JOIN users creator ON t.created_by = creator.id
        WHERE utq.user_id = $1
        ORDER BY utq.queue_position ASC
      `;
      params = [userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// Add task to queue
router.post('/:userId/queue', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskId } = req.body;

    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const taskResult = await pool.query(
      'SELECT task_list_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const taskListId = taskResult.rows[0].task_list_id;

    const maxPosResult = await pool.query(`
      SELECT COALESCE(MAX(utq.queue_position), 0) as max_pos
      FROM user_task_queue utq
      JOIN tasks t ON utq.task_id = t.id
      WHERE utq.user_id = $1 AND t.task_list_id = $2
    `, [userId, taskListId]);

    const newPosition = maxPosResult.rows[0].max_pos + 1;

    await pool.query(
      'INSERT INTO user_task_queue (user_id, task_id, queue_position) VALUES ($1, $2, $3) ON CONFLICT (user_id, task_id) DO NOTHING',
      [userId, taskId, newPosition]
    );

    const result = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, creator.name as created_by_name,
             utq.queue_position, utq.added_at as queued_at
      FROM user_task_queue utq
      JOIN tasks t ON utq.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      WHERE utq.user_id = $1 AND utq.task_id = $2
    `, [userId, taskId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Add to queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to add task to queue' });
  }
});

// Reorder queue
router.put('/:userId/queue/reorder', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskOrders } = req.body;

    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const { taskId, position } of taskOrders) {
        await client.query(
          'UPDATE user_task_queue SET queue_position = $1 WHERE user_id = $2 AND task_id = $3',
          [position, userId, taskId]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Queue reordered successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Reorder queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to reorder queue' });
  }
});

// Remove task from queue
router.delete('/:userId/queue/:taskId', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId, taskId } = req.params;

    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const taskInfoResult = await pool.query(`
      SELECT utq.queue_position, t.task_list_id
      FROM user_task_queue utq
      JOIN tasks t ON utq.task_id = t.id
      WHERE utq.user_id = $1 AND utq.task_id = $2
    `, [userId, taskId]);

    if (taskInfoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not in queue' });
    }

    const removedPosition = taskInfoResult.rows[0].queue_position;
    const taskListId = taskInfoResult.rows[0].task_list_id;

    logger.info('Removing task from queue', {
      userId,
      taskId,
      removedPosition,
      taskListId
    });

    await pool.query(
      'DELETE FROM user_task_queue WHERE user_id = $1 AND task_id = $2',
      [userId, taskId]
    );

    const updateResult = await pool.query(`
      UPDATE user_task_queue
      SET queue_position = queue_position - 1
      WHERE user_id = $1
        AND task_id IN (
          SELECT t.id
          FROM tasks t
          WHERE t.task_list_id = $2
        )
        AND queue_position > $3
      RETURNING task_id, queue_position
    `, [userId, taskListId, removedPosition]);

    logger.info('Updated queue positions after deletion', {
      updatedCount: updateResult.rowCount,
      updatedTasks: updateResult.rows
    });

    const renumberResult = await pool.query(`
      UPDATE user_task_queue utq
      SET queue_position = subquery.new_position
      FROM (
        SELECT
          utq2.task_id,
          ROW_NUMBER() OVER (ORDER BY utq2.queue_position) as new_position
        FROM user_task_queue utq2
        JOIN tasks t ON utq2.task_id = t.id
        WHERE utq2.user_id = $1 AND t.task_list_id = $2
      ) AS subquery
      WHERE utq.user_id = $1 AND utq.task_id = subquery.task_id
      RETURNING utq.task_id, utq.queue_position
    `, [userId, taskListId]);

    logger.info('Renumbered queue positions in single query', {
      renumberedCount: renumberResult.rowCount,
      finalPositions: renumberResult.rows
    });

    res.json({
      message: 'Task removed from queue',
      updatedPositions: renumberResult.rows
    });
  } catch (error) {
    logger.error('Remove from queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to remove task from queue' });
  }
});

module.exports = router;
