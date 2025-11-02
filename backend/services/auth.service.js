const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with valid flag and optional error message
 */
const validatePassword = (password) => {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  return { valid: true };
};

/**
 * Generate access and refresh tokens for a user
 * @param {number} userId - User ID
 * @returns {Object} Object containing accessToken and refreshToken
 */
const generateTokens = (userId) => {
  logger.debug('Generating tokens', { userId: sanitizeForLog(userId) });
  const accessToken = jwt.sign({ userId: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

module.exports = {
  validatePassword,
  generateTokens
};
