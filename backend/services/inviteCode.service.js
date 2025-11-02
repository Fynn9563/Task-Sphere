/**
 * Generate a random 8-character invite code
 * @returns {string} Uppercase invite code
 */
const generateInviteCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

module.exports = {
  generateInviteCode
};
