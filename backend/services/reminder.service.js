const schedule = require('node-schedule');

// Store active scheduled jobs
const scheduledJobs = new Map();

/**
 * Calculate reminder datetime based on due date and time offset
 * @param {Date|string} dueDate - Task due date
 * @param {number} timeValue - Time value (e.g., 5)
 * @param {string} timeUnit - Time unit (minutes, hours, days, weeks)
 * @returns {Date} Calculated reminder datetime
 */
const calculateReminderDatetime = (dueDate, timeValue, timeUnit) => {
  const due = new Date(dueDate);
  const reminder = new Date(due);

  switch (timeUnit) {
    case 'minutes':
      reminder.setMinutes(reminder.getMinutes() - timeValue);
      break;
    case 'hours':
      reminder.setHours(reminder.getHours() - timeValue);
      break;
    case 'days':
      reminder.setDate(reminder.getDate() - timeValue);
      break;
    case 'weeks':
      reminder.setDate(reminder.getDate() - (timeValue * 7));
      break;
  }

  return reminder;
};

/**
 * Create a task reminder
 * @param {Object} pool - Database connection pool
 * @param {number} taskId - Task ID
 * @param {number} userId - User ID
 * @param {Object} reminderData - Reminder data
 * @returns {Promise<Object>} Created reminder
 */
const createTaskReminder = async (pool, taskId, userId, reminderData) => {
  const { reminderType, timeValue, timeUnit, reminderDatetime } = reminderData;

  const result = await pool.query(
    `INSERT INTO task_reminders (task_id, user_id, reminder_type, time_value, time_unit, reminder_datetime)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [taskId, userId, reminderType, timeValue, timeUnit, reminderDatetime]
  );

  return result.rows[0];
};

/**
 * Get all reminders for a task
 * @param {Object} pool - Database connection pool
 * @param {number} taskId - Task ID
 * @returns {Promise<Array>} Array of reminders
 */
const getTaskReminders = async (pool, taskId) => {
  const result = await pool.query(
    `SELECT * FROM task_reminders
     WHERE task_id = $1
     ORDER BY reminder_datetime ASC`,
    [taskId]
  );

  return result.rows;
};

/**
 * Delete a task reminder
 * @param {Object} pool - Database connection pool
 * @param {number} reminderId - Reminder ID
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
const deleteTaskReminder = async (pool, reminderId, userId) => {
  const result = await pool.query(
    `DELETE FROM task_reminders
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [reminderId, userId]
  );

  return result.rowCount > 0;
};

/**
 * Get pending reminders that need to be sent
 * @param {Object} pool - Database connection pool
 * @returns {Promise<Array>} Array of pending reminders
 */
const getPendingReminders = async (pool) => {
  const result = await pool.query(
    `SELECT tr.*, t.name as task_name, t.due_date, t.task_list_id, tl.name as task_list_name
     FROM task_reminders tr
     JOIN tasks t ON tr.task_id = t.id
     JOIN task_lists tl ON t.task_list_id = tl.id
     WHERE tr.is_sent = false AND tr.reminder_datetime <= NOW()
     ORDER BY tr.reminder_datetime ASC`
  );

  return result.rows;
};

/**
 * Mark a reminder as sent
 * @param {Object} pool - Database connection pool
 * @param {number} reminderId - Reminder ID
 * @returns {Promise<void>}
 */
const markReminderAsSent = async (pool, reminderId) => {
  await pool.query(
    `UPDATE task_reminders
     SET is_sent = true, sent_at = NOW()
     WHERE id = $1`,
    [reminderId]
  );
};

/**
 * Recalculate all reminders for a task when due date changes
 * @param {Object} pool - Database connection pool
 * @param {number} taskId - Task ID
 * @param {Date|string} newDueDate - New due date
 * @returns {Promise<void>}
 */
const recalculateTaskReminders = async (pool, taskId, newDueDate) => {
  const reminders = await getTaskReminders(pool, taskId);

  for (const reminder of reminders) {
    const newReminderDatetime = calculateReminderDatetime(newDueDate, reminder.time_value, reminder.time_unit);

    if (newReminderDatetime < new Date()) {
      await pool.query('DELETE FROM task_reminders WHERE id = $1', [reminder.id]);
    } else {
      await pool.query(
        'UPDATE task_reminders SET reminder_datetime = $1 WHERE id = $2',
        [newReminderDatetime, reminder.id]
      );
    }
  }
};

/**
 * Check if a duplicate reminder exists
 * @param {Object} pool - Database connection pool
 * @param {number} taskId - Task ID
 * @param {number} userId - User ID
 * @param {Date} reminderDatetime - Reminder datetime
 * @returns {Promise<boolean>} True if duplicate exists
 */
const checkDuplicateReminder = async (pool, taskId, userId, reminderDatetime) => {
  const result = await pool.query(
    `SELECT id FROM task_reminders
     WHERE task_id = $1 AND user_id = $2 AND reminder_datetime = $3`,
    [taskId, userId, reminderDatetime]
  );

  return result.rows.length > 0;
};

/**
 * Get missed reminders for a user
 * @param {Object} pool - Database connection pool
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of missed reminders
 */
const getMissedReminders = async (pool, userId) => {
  const result = await pool.query(
    `SELECT tr.*, t.name as task_name, t.due_date, t.task_list_id, tl.name as task_list_name
     FROM task_reminders tr
     JOIN tasks t ON tr.task_id = t.id
     JOIN task_lists tl ON t.task_list_id = tl.id
     WHERE tr.user_id = $1 AND tr.is_sent = true AND tr.sent_at > NOW() - INTERVAL '7 days'
     ORDER BY tr.sent_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Schedule a reminder job using node-schedule
 * @param {number} reminderId - Reminder ID
 * @param {Date} reminderDatetime - When to send the reminder
 * @param {Function} callback - Function to execute when reminder triggers
 * @returns {void}
 */
const scheduleReminderJob = (reminderId, reminderDatetime, callback) => {
  // Cancel existing job if it exists
  cancelReminderJob(reminderId);

  // Only schedule if reminder is in the future
  if (new Date(reminderDatetime) > new Date()) {
    const job = schedule.scheduleJob(new Date(reminderDatetime), callback);
    scheduledJobs.set(`reminder-${reminderId}`, job);
  }
};

/**
 * Cancel a scheduled reminder job
 * @param {number} reminderId - Reminder ID
 * @returns {void}
 */
const cancelReminderJob = (reminderId) => {
  const jobKey = `reminder-${reminderId}`;
  const job = scheduledJobs.get(jobKey);

  if (job) {
    job.cancel();
    scheduledJobs.delete(jobKey);
  }
};

/**
 * Cancel all reminder jobs for a task
 * @param {Array} reminders - Array of reminder objects
 * @returns {void}
 */
const cancelAllTaskReminderJobs = (reminders) => {
  for (const reminder of reminders) {
    cancelReminderJob(reminder.id);
  }
};

/**
 * Get count of active scheduled jobs
 * @returns {number}
 */
const getActiveJobCount = () => {
  return scheduledJobs.size;
};

module.exports = {
  calculateReminderDatetime,
  createTaskReminder,
  getTaskReminders,
  deleteTaskReminder,
  getPendingReminders,
  markReminderAsSent,
  recalculateTaskReminders,
  checkDuplicateReminder,
  getMissedReminders,
  scheduleReminderJob,
  cancelReminderJob,
  cancelAllTaskReminderJobs,
  getActiveJobCount
};
