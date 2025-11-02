const { escape: sanitizeString } = require('./validation');

/**
 * Prevent log injection attacks by sanitizing data
 * @param {any} data - Data to sanitize for logging
 * @returns {any} Sanitized data safe for logging
 */
const sanitizeForLog = (data) => {
  if (typeof data === 'string') {
    return data.replace(/[\n\r\t\x00-\x1F\x7F]/g, '');
  }
  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        sanitized[key] = sanitizeForLog(data[key]);
      }
    }
    return sanitized;
  }
  return data;
};

/**
 * Sanitize user input to prevent injection attacks
 * @param {any} input - Input to sanitize
 * @returns {any} Sanitized input
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return sanitizeString(input);
};

module.exports = {
  sanitizeForLog,
  sanitizeInput
};
