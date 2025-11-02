const cron = require('node-cron');
const { logger } = require('./logger');
const { sanitizeForLog } = require('./sanitization');
const { scheduleReminderJob, markReminderAsSent, getActiveJobCount } = require('../services/reminder.service');

/**
 * Initialize scheduled jobs
 * @param {Object} pool - Database connection pool
 * @param {Object} io - Socket.io instance
 * @param {Function} createNotification - Function to create notifications
 */
const initializeScheduledJobs = async (pool, io, createNotification) => {
  // Daily database keep-alive
  cron.schedule('0 3 * * *', async () => {
    try {
      logger.debug('Running database keep-alive ping');
      await pool.query('SELECT 1');
      logger.debug('Database keep-alive ping successful');
    } catch (error) {
      logger.error('Database keep-alive ping failed', { error: sanitizeForLog(error.message) });
    }
  });

  logger.info('Database keep-alive job scheduled (daily at 3 AM)');

  // Load and schedule all existing unsent reminders
  try {
    const result = await pool.query(`
      SELECT tr.*, t.name as task_name, t.due_date, t.task_list_id
      FROM task_reminders tr
      JOIN tasks t ON tr.task_id = t.id
      WHERE tr.is_sent = false AND tr.reminder_datetime > NOW()
      ORDER BY tr.reminder_datetime ASC
    `);

    for (const reminder of result.rows) {
      scheduleReminderJob(reminder.id, reminder.reminder_datetime, async () => {
        try {
          const dueDateObj = new Date(reminder.due_date);
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
            reminder.task_list_id,
            'task_reminder',
            'Task Reminder',
            `"${reminder.task_name}" starts at ${formattedDueDate}`
          );

          await markReminderAsSent(pool, reminder.id);

          logger.info('Reminder sent', {
            reminderId: sanitizeForLog(reminder.id),
            taskId: sanitizeForLog(reminder.task_id),
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

    logger.info(`Loaded and scheduled ${result.rows.length} reminders (${getActiveJobCount()} active jobs)`);
  } catch (error) {
    logger.error('Error loading reminders on startup', { error: sanitizeForLog(error.message) });
  }
};

module.exports = {
  initializeScheduledJobs
};
