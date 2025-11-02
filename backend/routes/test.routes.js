const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification } = require('../services/notification.service');
const { logger } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

const router = express.Router();

// Inject io instance for real-time updates
let io;
router.setIO = (ioInstance) => {
  io = ioInstance;
};

// Test endpoint to trigger a notification immediately
router.get('/trigger-notification/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;

    // Get task details
    const taskResult = await pool.query(
      'SELECT t.name, t.due_date, t.task_list_id FROM tasks t WHERE t.id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Format the due date
    const dueDateObj = new Date(task.due_date);
    const formattedDueDate = dueDateObj.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Create and send notification
    await createNotification(
      pool,
      io,
      req.user.userId,
      parseInt(taskId),
      task.task_list_id,
      'task_reminder',
      'Task Reminder',
      `"${task.name}" starts at ${formattedDueDate}`
    );

    logger.info('Test notification triggered', {
      taskId: sanitizeForLog(taskId),
      userId: sanitizeForLog(req.user.userId)
    });

    res.json({
      success: true,
      message: 'Test notification sent',
      task: task.name
    });
  } catch (error) {
    logger.error('Test notification error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;
