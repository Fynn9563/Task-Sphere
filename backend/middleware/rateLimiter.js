const rateLimit = require('express-rate-limit');

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * General rate limiter for all API endpoints
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 100
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 5,
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for queue operations
 */
const queueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 500 : 50,
  message: { error: 'Too many queue operations, please try again later' }
});

module.exports = {
  limiter,
  authLimiter,
  queueLimiter
};
