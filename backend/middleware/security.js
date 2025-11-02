const helmet = require('helmet');
const timeout = require('connect-timeout');

/**
 * Middleware to check if request has timed out
 */
const haltOnTimedout = (req, res, next) => {
  if (!req.timedout) next();
};

/**
 * HTTPS redirect middleware for production
 */
const httpsRedirect = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  } else {
    next();
  }
};

/**
 * Get all security middleware in order
 * @param {Object} app - Express app instance
 */
const applySecurityMiddleware = (app) => {
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(timeout('30s'));
  app.use(haltOnTimedout);
  app.use(httpsRedirect);
};

module.exports = {
  applySecurityMiddleware,
  haltOnTimedout,
  httpsRedirect
};
