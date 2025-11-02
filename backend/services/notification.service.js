const { logger } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

/**
 * Create a notification for a user
 * @param {Object} pool - Database connection pool
 * @param {Object} io - Socket.io instance
 * @param {number} userId - User ID to receive notification
 * @param {number} taskId - Related task ID
 * @param {number} taskListId - Related task list ID
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (pool, io, userId, taskId, taskListId, type, title, message) => {
  try {
    logger.debug('Creating notification', {
      userId: sanitizeForLog(userId),
      taskId: sanitizeForLog(taskId),
      taskListId: sanitizeForLog(taskListId),
      type: sanitizeForLog(type),
      title: sanitizeForLog(title)
    });

    const result = await pool.query(
      'INSERT INTO notifications (user_id, task_id, task_list_id, type, title, message, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      [userId, taskId, taskListId, type, title, message]
    );

    const notification = result.rows[0];

    if (taskListId) {
      const taskListResult = await pool.query(
        'SELECT name FROM task_lists WHERE id = $1',
        [taskListId]
      );

      if (taskListResult.rows.length > 0) {
        notification.task_list_name = taskListResult.rows[0].name;
      }
    }

    io.to(`user_${userId}`).emit('newNotification', notification);
    logger.debug('Notification created and emitted', { notificationId: sanitizeForLog(notification.id) });
    return notification;
  } catch (error) {
    logger.error('Error creating notification', { error: sanitizeForLog(error.message) });
  }
};

module.exports = {
  createNotification
};
