const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const {
  calculateReminderDatetime,
  createTaskReminder,
  getTaskReminders,
  deleteTaskReminder,
  checkDuplicateReminder,
  getMissedReminders,
  scheduleReminderJob,
  cancelReminderJob,
  markReminderAsSent
} = require('../services/reminder.service');
const { createNotification } = require('../services/notification.service');
const { schemas } = require('../models/schemas');
const { logger } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

const router = express.Router();

// Inject io instance for real-time updates
let io;
router.setIO = (ioInstance) => {
  io = ioInstance;
};

// Create reminder(s) for a task
router.post('/tasks/:id/reminders', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const reminders = Array.isArray(req.body) ? req.body : [req.body];

    const taskResult = await pool.query('SELECT due_date, task_list_id FROM tasks WHERE id = $1', [id]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    if (!task.due_date) {
      return res.status(400).json({ error: 'Cannot set reminders on tasks without a due date' });
    }

    const createdReminders = [];

    for (const reminderData of reminders) {
      const { error, value } = schemas.reminder.validate(reminderData);

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { reminderType, timeValue, timeUnit } = value;
      const reminderDatetime = calculateReminderDatetime(task.due_date, timeValue, timeUnit);

      if (reminderDatetime < new Date()) {
        return res.status(400).json({ error: 'Reminder time cannot be in the past' });
      }

      const isDuplicate = await checkDuplicateReminder(pool, id, req.user.userId, reminderDatetime);

      if (isDuplicate) {
        return res.status(400).json({ error: 'A reminder already exists for this time' });
      }

      const reminder = await createTaskReminder(pool, id, req.user.userId, {
        reminderType,
        timeValue,
        timeUnit,
        reminderDatetime
      });

      // Get task details for the scheduled job
      const taskDetailsResult = await pool.query(
        'SELECT t.name, t.due_date, t.task_list_id FROM tasks t WHERE t.id = $1',
        [id]
      );
      const taskDetails = taskDetailsResult.rows[0];

      // Schedule the reminder job
      scheduleReminderJob(reminder.id, reminderDatetime, async () => {
        try {
          const dueDateObj = new Date(taskDetails.due_date);
          const formattedDueDate = dueDateObj.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          await createNotification(
            pool,
            io,
            req.user.userId,
            parseInt(id),
            taskDetails.task_list_id,
            'task_reminder',
            'Task Reminder',
            `"${taskDetails.name}" starts at ${formattedDueDate}`
          );

          await markReminderAsSent(pool, reminder.id);

          logger.info('Reminder sent', {
            reminderId: sanitizeForLog(reminder.id),
            taskId: sanitizeForLog(id),
            userId: sanitizeForLog(req.user.userId)
          });
        } catch (error) {
          logger.error('Error sending reminder', {
            reminderId: sanitizeForLog(reminder.id),
            error: sanitizeForLog(error.message)
          });
        }
      });

      createdReminders.push(reminder);
    }

    logger.info('Reminders created', {
      taskId: sanitizeForLog(id),
      count: createdReminders.length
    });

    res.status(201).json(createdReminders);
  } catch (error) {
    logger.error('Create reminder error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// Get reminders for a task
router.get('/tasks/:id/reminders', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const reminders = await getTaskReminders(pool, id);

    res.json(reminders);
  } catch (error) {
    logger.error('Get reminders error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Delete a reminder
router.delete('/tasks/:taskId/reminders/:reminderId', authenticateToken, async (req, res) => {
  try {
    const { taskId, reminderId } = req.params;

    const deleted = await deleteTaskReminder(pool, reminderId, req.user.userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Reminder not found or unauthorized' });
    }

    // Cancel the scheduled job
    cancelReminderJob(reminderId);

    logger.info('Reminder deleted', {
      reminderId: sanitizeForLog(reminderId),
      taskId: sanitizeForLog(taskId)
    });

    res.json({ message: 'Reminder deleted successfully' });
  } catch (error) {
    logger.error('Delete reminder error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

// Get missed reminders for user
router.get('/reminders/missed', authenticateToken, async (req, res) => {
  try {
    const missedReminders = await getMissedReminders(pool, req.user.userId);

    res.json(missedReminders);
  } catch (error) {
    logger.error('Get missed reminders error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch missed reminders' });
  }
});

module.exports = router;
