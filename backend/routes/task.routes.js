const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification } = require('../services/notification.service');
const {
  recalculateTaskReminders,
  getTaskReminders,
  cancelAllTaskReminderJobs,
  scheduleReminderJob,
  markReminderAsSent
} = require('../services/reminder.service');
const { sanitizeInput, sanitizeForLog } = require('../utils/sanitization');
const { schemas } = require('../models/schemas');
const { logger } = require('../utils/logger');

const router = express.Router();

// Inject io instance for real-time updates
let io;
router.setIO = (ioInstance) => {
  io = ioInstance;
};

// Get tasks for a task list
router.get('/task-lists/:id/tasks', authenticateToken, async (req, res) => {
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
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
             assigned_user.avatar_url as assigned_to_avatar_url,
             creator.name as created_by_name,
             utq.queue_position,
             (SELECT MIN(tr.reminder_datetime)
              FROM task_reminders tr
              WHERE tr.task_id = t.id AND tr.is_sent = false) as next_reminder_datetime
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN user_task_queue utq ON t.id = utq.task_id AND utq.user_id = $2
      WHERE t.task_list_id = $1
      ORDER BY t.created_at DESC
    `, [id, req.user.userId]);

    res.json(result.rows);
  } catch (error) {
    logger.error('Get tasks error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create task
router.post('/task-lists/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, projectId, requesterId, priority, assignedTo, dueDate, estimatedHours } = req.body;

    const { error } = schemas.task.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      return res.status(400).json({ error: errorMessage });
    }

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let processedAssignedTo = null;
    if (assignedTo !== null && assignedTo !== undefined && assignedTo !== "") {
      const assignedToId = parseInt(assignedTo);
      if (!isNaN(assignedToId)) {
        const assignedMemberCheck = await pool.query(
          'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
          [id, assignedToId]
        );

        if (assignedMemberCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Assigned user is not a member of this task list' });
        }
        processedAssignedTo = assignedToId;
      }
    }

    if (estimatedHours !== null && estimatedHours !== undefined && estimatedHours !== "") {
      const hours = parseFloat(estimatedHours);
      if (isNaN(hours) || hours < 0 || hours > 999) {
        return res.status(400).json({ error: 'Estimated hours must be between 0 and 999' });
      }
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : null;
    logger.debug('Creating task', { assignedTo: processedAssignedTo });

    const result = await pool.query(
      `INSERT INTO tasks (name, description, task_list_id, project_id, requester_id,
       priority, assigned_to, due_date, estimated_hours, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [sanitizedName, sanitizedDescription, id, projectId || null, requesterId || null,
       priority || 'medium', processedAssignedTo, dueDate || null,
       estimatedHours || null, req.user.userId]
    );

    const taskResult = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
             assigned_user.avatar_url as assigned_to_avatar_url,
             creator.name as created_by_name,
             tl.name as task_list_name, utq.queue_position,
             (SELECT MIN(tr.reminder_datetime)
              FROM task_reminders tr
              WHERE tr.task_id = t.id AND tr.is_sent = false) as next_reminder_datetime
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN task_lists tl ON t.task_list_id = tl.id
      LEFT JOIN user_task_queue utq ON t.id = utq.task_id AND utq.user_id = $2
      WHERE t.id = $1
    `, [result.rows[0].id, req.user.userId]);

    const newTask = taskResult.rows[0];

    logger.info('Task created', { taskId: sanitizeForLog(newTask.id), taskListId: sanitizeForLog(id) });

    if (processedAssignedTo && processedAssignedTo !== req.user.userId) {
      try {
        await createNotification(
          pool,
          io,
          processedAssignedTo,
          newTask.id,
          newTask.task_list_id,
          'task_assigned',
          'New Task Assigned',
          `You have been assigned to "${newTask.name}" in ${newTask.task_list_name}`
        );
      } catch (notifError) {
        logger.error('Error creating assignment notification', { error: sanitizeForLog(notifError.message) });
      }
    }

    if (io) {
      io.to(`taskList_${id}`).emit('taskCreated', newTask);
    }

    res.status(201).json(newTask);
  } catch (error) {
    logger.error('Create task error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    logger.debug('Updating task', { taskId: sanitizeForLog(id) });

    const { error } = schemas.task.validate(updates, { abortEarly: false, allowUnknown: true });
    if (error) {
      logger.warn('Task validation error', { error: sanitizeForLog(error.message) });
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      return res.status(400).json({ error: errorMessage });
    }
    logger.debug('Task validation passed');

    const originalTaskResult = await pool.query(
      'SELECT assigned_to, task_list_id, due_date, status FROM tasks WHERE id = $1',
      [id]
    );

    if (originalTaskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const originalTask = originalTaskResult.rows[0];

    const validUpdates = {};
    const allowedFields = [
      'name', 'description', 'status', 'priority',
      'due_date', 'estimated_hours', 'estimatedHours', 'project_id', 'projectId',
      'requester_id', 'requesterId', 'assigned_to', 'assignedTo', 'day_assigned', 'dayAssigned'
    ];

    const toSnakeCase = (str) => {
      return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    };

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        const dbKey = toSnakeCase(key);
        if (typeof updates[key] === 'string') {
          validUpdates[dbKey] = sanitizeInput(updates[key]);
        } else {
          validUpdates[dbKey] = updates[key];
        }
      }
    });

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    logger.debug('Valid updates prepared', { fields: Object.keys(validUpdates) });

    const setClause = Object.keys(validUpdates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = [id, ...Object.values(validUpdates)];
    logger.debug('SQL SET clause generated');
    logger.debug('SQL values prepared', { valueCount: values.length });

    const query = `UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    logger.debug('Final query prepared');

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    logger.debug('Task updated in database', { taskId: sanitizeForLog(result.rows[0].id) });

    const taskResult = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
             assigned_user.avatar_url as assigned_to_avatar_url,
             creator.name as created_by_name,
             utq.queue_position,
             (SELECT MIN(tr.reminder_datetime)
              FROM task_reminders tr
              WHERE tr.task_id = t.id AND tr.is_sent = false) as next_reminder_datetime
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN user_task_queue utq ON t.id = utq.task_id AND utq.user_id = $2
      WHERE t.id = $1
    `, [id, req.user.userId]);

    const updatedTask = taskResult.rows[0];

    logger.info('Task update complete', { taskId: sanitizeForLog(updatedTask.id) });

    if (validUpdates.assigned_to !== undefined &&
        validUpdates.assigned_to !== originalTask.assigned_to &&
        validUpdates.assigned_to !== req.user.userId) {

      try {
        const taskListResult = await pool.query(
          'SELECT tl.name FROM task_lists tl WHERE tl.id = $1',
          [originalTask.task_list_id]
        );

        if (taskListResult.rows.length > 0 && validUpdates.assigned_to) {
          await createNotification(
            pool,
            io,
            validUpdates.assigned_to,
            updatedTask.id,
            updatedTask.task_list_id,
            'task_assigned',
            'Task Assignment Update',
            `You have been assigned to "${updatedTask.name}" in ${taskListResult.rows[0].name}`
          );
        }
      } catch (notifError) {
        logger.error('Error creating assignment notification', { error: sanitizeForLog(notifError.message) });
      }
    }

    // Handle reminder updates
    if (validUpdates.due_date && validUpdates.due_date !== originalTask.due_date) {
      try {
        // Recalculate reminder datetimes in database
        await recalculateTaskReminders(pool, id, validUpdates.due_date);

        // Get updated reminders and reschedule jobs
        const reminders = await getTaskReminders(pool, id);

        // Cancel all existing jobs for this task
        cancelAllTaskReminderJobs(reminders);

        // Reschedule active reminders
        for (const reminder of reminders) {
          if (!reminder.is_sent && new Date(reminder.reminder_datetime) > new Date()) {
            scheduleReminderJob(reminder.id, reminder.reminder_datetime, async () => {
              try {
                const taskDetailsResult = await pool.query(
                  'SELECT t.name, t.due_date, t.task_list_id FROM tasks t WHERE t.id = $1',
                  [id]
                );
                const taskDetails = taskDetailsResult.rows[0];

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
                  reminder.user_id,
                  reminder.task_id,
                  taskDetails.task_list_id,
                  'task_reminder',
                  'Task Reminder',
                  `"${taskDetails.name}" starts at ${formattedDueDate}`
                );

                await markReminderAsSent(pool, reminder.id);

                logger.info('Reminder sent', {
                  reminderId: sanitizeForLog(reminder.id),
                  taskId: sanitizeForLog(id),
                  userId: sanitizeForLog(reminder.user_id)
                });
              } catch (error) {
                logger.error('Error sending reminder', {
                  reminderId: sanitizeForLog(reminder.id),
                  error: sanitizeForLog(error.message)
                });
              }
            });
          }
        }

        logger.debug('Reminders recalculated and rescheduled after due date change', { taskId: sanitizeForLog(id) });
      } catch (reminderError) {
        logger.error('Error recalculating reminders', { error: sanitizeForLog(reminderError.message) });
      }
    }

    // Delete unsent reminders if task is marked as completed
    if (validUpdates.status === true && originalTask.status === false) {
      try {
        // Get reminders before deleting to cancel jobs
        const reminders = await getTaskReminders(pool, id);

        // Cancel all scheduled jobs
        cancelAllTaskReminderJobs(reminders);

        // Delete unsent reminders from database
        await pool.query('DELETE FROM task_reminders WHERE task_id = $1 AND is_sent = false', [id]);
        logger.debug('Deleted unsent reminders for completed task', { taskId: sanitizeForLog(id) });
      } catch (reminderError) {
        logger.error('Error deleting reminders for completed task', { error: sanitizeForLog(reminderError.message) });
      }
    }

    const taskListId = updatedTask.task_list_id;
    if (io) {
      io.to(`taskList_${taskListId}`).emit('taskUpdated', updatedTask);
    }

    res.json(updatedTask);
  } catch (error) {
    logger.error('Update task error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING task_list_id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const taskListId = result.rows[0].task_list_id;

    const renumberResult = await pool.query(`
      UPDATE user_task_queue utq
      SET queue_position = subquery.new_position
      FROM (
        SELECT
          utq2.user_id,
          utq2.task_id,
          ROW_NUMBER() OVER (PARTITION BY utq2.user_id ORDER BY utq2.queue_position) as new_position
        FROM user_task_queue utq2
        JOIN tasks t ON utq2.task_id = t.id
        WHERE t.task_list_id = $1
      ) AS subquery
      WHERE utq.user_id = subquery.user_id AND utq.task_id = subquery.task_id
      RETURNING utq.user_id, utq.task_id, utq.queue_position
    `, [taskListId]);

    logger.info('Renumbered queue positions for all users after task deletion', {
      taskListId,
      totalUpdates: renumberResult.rowCount
    });

    if (io) {
      io.to(`taskList_${taskListId}`).emit('taskDeleted', { id: parseInt(id) });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    logger.error('Delete task error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
