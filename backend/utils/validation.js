// utils/validation.js
// Safe wrapper around validator.js
// NOTE: validator.isURL() has a known vulnerability (GHSA-9965-vmph-33xx)
// This wrapper only exposes safe functions

const validator = require('validator');

/**
 * SAFE: Escapes HTML entities to prevent XSS
 * @param {string} input - The string to escape
 * @returns {string} - Escaped string
 */
const escape = (input) => {
  if (typeof input !== 'string') return input;
  return validator.escape(input.trim());
};

/**
 * SAFE: Validates email format
 * @param {string} email - The email to validate
 * @returns {boolean} - True if valid email
 */
const isEmail = (email) => {
  if (typeof email !== 'string') return false;
  return validator.isEmail(email);
};

/**
 * SAFE: Checks if string is alphanumeric
 * @param {string} str - The string to check
 * @returns {boolean} - True if alphanumeric
 */
const isAlphanumeric = (str) => {
  if (typeof str !== 'string') return false;
  return validator.isAlphanumeric(str);
};

/**
 * SAFE: Checks if string is a valid UUID
 * @param {string} str - The string to check
 * @returns {boolean} - True if valid UUID
 */
const isUUID = (str) => {
  if (typeof str !== 'string') return false;
  return validator.isUUID(str);
};

// NOTE: validator.isURL() has a known vulnerability (GHSA-9965-vmph-33xx)
// and is NOT included in this wrapper. Use an alternative URL validation method if needed.

module.exports = {
  escape,
  isEmail,
  isAlphanumeric,
  isUUID,
};
