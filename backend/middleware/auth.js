const jwt = require('jsonwebtoken');
const { logger, securityLog } = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitization');

/**
 * Middleware to authenticate JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    securityLog('AUTH_FAILURE', { reason: 'No token provided', path: req.path }, req);
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.error('JWT verification error', { error: sanitizeForLog(err.message) });
      if (err.name === 'TokenExpiredError') {
        securityLog('AUTH_FAILURE', { reason: 'Token expired', path: req.path }, req);
        return res.status(403).json({ error: 'Token expired', needsRefresh: true });
      }
      securityLog('AUTH_FAILURE', { reason: 'Invalid token', error: err.message, path: req.path }, req);
      return res.status(403).json({ error: 'Invalid token' });
    }
    logger.debug('JWT decoded user', { userId: sanitizeForLog(user.userId), email: sanitizeForLog(user.email) });
    req.user = user;
    next();
  });
};

module.exports = {
  authenticateToken
};
