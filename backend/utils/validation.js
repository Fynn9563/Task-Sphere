// Safe wrapper for validator.js (excludes vulnerable isURL function)
const validator = require('validator');

const escape = (input) => {
  if (typeof input !== 'string') return input;
  return validator.escape(input.trim());
};

const isEmail = (email) => {
  if (typeof email !== 'string') return false;
  return validator.isEmail(email);
};

const isAlphanumeric = (str) => {
  if (typeof str !== 'string') return false;
  return validator.isAlphanumeric(str);
};

const isUUID = (str) => {
  if (typeof str !== 'string') return false;
  return validator.isUUID(str);
};

module.exports = {
  escape,
  isEmail,
  isAlphanumeric,
  isUUID,
};
