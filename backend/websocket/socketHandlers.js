const { logger } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

/**
 * Initialize WebSocket event handlers
 * @param {Object} io - Socket.io instance
 */
const initializeSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    logger.debug('WebSocket user connected', { socketId: sanitizeForLog(socket.id) });

    socket.on('joinUser', (userId) => {
      socket.join(`user_${userId}`);
      logger.debug('User joined room', { socketId: sanitizeForLog(socket.id), userId: sanitizeForLog(userId) });
    });

    socket.on('joinTaskList', (taskListId) => {
      socket.join(`taskList_${taskListId}`);
      logger.debug('User joined task list room', { socketId: sanitizeForLog(socket.id), taskListId: sanitizeForLog(taskListId) });
    });

    socket.on('leaveTaskList', (taskListId) => {
      socket.leave(`taskList_${taskListId}`);
      logger.debug('User left task list room', { socketId: sanitizeForLog(socket.id), taskListId: sanitizeForLog(taskListId) });
    });

    socket.on('disconnect', () => {
      logger.debug('WebSocket user disconnected', { socketId: sanitizeForLog(socket.id) });
    });
  });
};

module.exports = {
  initializeSocketHandlers
};
