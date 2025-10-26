const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
      )
    ),
  }),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.json(),
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.json(),
  }),
  new winston.transports.File({
    filename: 'logs/security.log',
    level: 'warn',
    format: winston.format.json(),
  }),
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
});

const requestIdMiddleware = (req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
};

const httpLoggerMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.http('HTTP Request', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || '',
      userId: req.user?.userId || 'anonymous',
    });
  });

  next();
};

const securityLog = (eventType, details, req = null) => {
  const logData = {
    eventType,
    timestamp: new Date().toISOString(),
    requestId: req?.id,
    ip: req ? (req.ip || req.connection.remoteAddress) : 'N/A',
    userId: req?.user?.userId || 'anonymous',
    ...details,
  };

  logger.warn('Security Event', logData);
};

// Failed login tracking
const failedLoginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

const trackFailedLogin = (identifier) => {
  const now = Date.now();
  const attempts = failedLoginAttempts.get(identifier) || { count: 0, firstAttempt: now, lockedUntil: null };

  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    const remainingTime = Math.ceil((attempts.lockedUntil - now) / 1000 / 60);
    return {
      locked: true,
      remainingMinutes: remainingTime,
      message: `Account temporarily locked. Try again in ${remainingTime} minutes.`,
    };
  }

  if (now - attempts.firstAttempt > LOCKOUT_DURATION) {
    attempts.count = 0;
    attempts.firstAttempt = now;
    attempts.lockedUntil = null;
  }

  attempts.count++;

  if (attempts.count >= MAX_FAILED_ATTEMPTS) {
    attempts.lockedUntil = now + LOCKOUT_DURATION;
    failedLoginAttempts.set(identifier, attempts);

    logger.warn('Account Locked Due to Failed Login Attempts', {
      identifier,
      attemptCount: attempts.count,
      lockedUntil: new Date(attempts.lockedUntil).toISOString(),
    });

    return {
      locked: true,
      remainingMinutes: Math.ceil(LOCKOUT_DURATION / 1000 / 60),
      message: `Too many failed login attempts. Account locked for ${Math.ceil(LOCKOUT_DURATION / 1000 / 60)} minutes.`,
    };
  }

  failedLoginAttempts.set(identifier, attempts);

  logger.info('Failed Login Attempt', {
    identifier,
    attemptCount: attempts.count,
    remainingAttempts: MAX_FAILED_ATTEMPTS - attempts.count,
  });

  return {
    locked: false,
    attemptCount: attempts.count,
    remainingAttempts: MAX_FAILED_ATTEMPTS - attempts.count,
  };
};

const resetFailedLoginAttempts = (identifier) => {
  failedLoginAttempts.delete(identifier);
};

// Cleanup expired lockouts hourly
setInterval(() => {
  const now = Date.now();
  for (const [identifier, attempts] of failedLoginAttempts.entries()) {
    if (attempts.lockedUntil && now > attempts.lockedUntil) {
      failedLoginAttempts.delete(identifier);
    }
  }
}, 60 * 60 * 1000);

module.exports = {
  logger,
  requestIdMiddleware,
  httpLoggerMiddleware,
  securityLog,
  trackFailedLogin,
  resetFailedLoginAttempts,
};
