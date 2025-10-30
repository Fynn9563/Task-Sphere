const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Server } = require('socket.io');
const http = require('http');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const timeout = require('connect-timeout');
const Joi = require('joi');
const { escape: sanitizeString, isEmail: validateEmailFormat } = require('./utils/validation');
const cron = require('node-cron');
const {
  logger,
  requestIdMiddleware,
  httpLoggerMiddleware,
  securityLog,
  trackFailedLogin,
  resetFailedLoginAttempts
} = require('./utils/logger');
require('dotenv').config();

// Prevent log injection attacks
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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Security middleware
app.set('trust proxy', 1);
app.use(helmet());
app.use(timeout('30s'));
app.use((req, res, next) => {
  if (!req.timedout) next();
});

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Rate limiting
const isDevelopment = process.env.NODE_ENV === 'development';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 100
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 50 : 5,
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const queueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 500 : 50,
  message: { error: 'Too many queue operations, please try again later' }
});

app.use('/api/', limiter);

// Database connection
if (!process.env.SUPABASE_CA_CERT) {
  throw new Error('SUPABASE_CA_CERT environment variable is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.SUPABASE_CA_CERT
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);
app.use(express.static('public'));

// Helper functions
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return sanitizeString(input);
};


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

// Validation schemas
const schemas = {
  task: Joi.object({
    name: Joi.string().min(1).max(500).optional().messages({
      'string.empty': 'Task name is required',
      'string.max': 'Task name must be less than 500 characters',
      'any.required': 'Task name is required'
    }),
    description: Joi.string().max(2000).allow(null, '').messages({
      'string.max': 'Description must be less than 2000 characters'
    }),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').messages({
      'any.only': 'Priority must be one of: low, medium, high, urgent'
    }),
    projectId: Joi.number().integer().allow(null),
    requesterId: Joi.number().integer().allow(null),
    assignedTo: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null),
    dueDate: Joi.string().isoDate().allow(null).messages({
      'date.format': 'Please enter a valid date and time'
    }),
    estimatedHours: Joi.number().min(0).max(999.99).allow(null).messages({
      'number.min': 'Estimated hours cannot be negative',
      'number.max': 'Estimated hours cannot exceed 999.99'
    }),
    estimated_hours: Joi.number().min(0).max(999.99).allow(null).messages({
      'number.min': 'Estimated hours cannot be negative',
      'number.max': 'Estimated hours cannot exceed 999.99'
    }),
    dayAssigned: Joi.string().allow(null),
    status: Joi.boolean()
  }),

  taskList: Joi.object({
    name: Joi.string().min(1).max(200).required().messages({
      'string.empty': 'Task list name is required',
      'string.max': 'Task list name must be less than 200 characters',
      'any.required': 'Task list name is required'
    }),
    description: Joi.string().max(1000).allow(null, '').messages({
      'string.max': 'Description must be less than 1000 characters'
    })
  }),

  reminder: Joi.object({
    reminderType: Joi.string().valid('predefined', 'custom').required().messages({
      'any.only': 'Reminder type must be either predefined or custom',
      'any.required': 'Reminder type is required'
    }),
    timeValue: Joi.number().integer().min(1).required().messages({
      'number.base': 'Time value must be a number',
      'number.min': 'Time value must be at least 1',
      'any.required': 'Time value is required'
    }),
    timeUnit: Joi.string().valid('minutes', 'hours', 'days', 'weeks').required().messages({
      'any.only': 'Time unit must be one of: minutes, hours, days, weeks',
      'any.required': 'Time unit is required'
    })
  })
};

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Task Sphere API is running!' });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Auth middleware
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

app.get('/api/debug/auth', authenticateToken, (req, res) => {
  res.json({ 
    message: 'Auth working',
    user: req.user,
    userId: req.user.userId 
  });
});

// Database setup
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        refresh_token VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS task_lists (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        invite_code VARCHAR(50) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS task_list_members (
        id SERIAL PRIMARY KEY,
        task_list_id INTEGER REFERENCES task_lists(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(task_list_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        task_list_id INTEGER REFERENCES task_lists(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS requesters (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        task_list_id INTEGER REFERENCES task_lists(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status BOOLEAN DEFAULT FALSE,
        priority VARCHAR(20) DEFAULT 'medium',
        due_date DATE,
        estimated_hours DECIMAL(5,2),
        task_list_id INTEGER REFERENCES task_lists(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        requester_id INTEGER REFERENCES requesters(id) ON DELETE SET NULL,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        task_list_id INTEGER REFERENCES task_lists(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_task_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        queue_position INTEGER NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, task_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(task_list_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_task_list_members_user ON task_list_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_user_task_queue_user ON user_task_queue(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_task_queue_position ON user_task_queue(user_id, queue_position);
    `);
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Database initialization error', { error: sanitizeForLog(error.message) });
  }
};

// Generate 8-char invite code
const generateInviteCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

const generateTokens = (userId) => {
  logger.debug('Generating tokens', { userId: sanitizeForLog(userId) });
  const accessToken = jwt.sign({ userId: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

const createNotification = async (userId, taskId, taskListId, type, title, message) => {
  try {
    logger.debug('Creating notification', {
      userId: sanitizeForLog(userId),
      taskId: sanitizeForLog(taskId),
      taskListId: sanitizeForLog(taskListId),
      type: sanitizeForLog(type),
      title: sanitizeForLog(title)
    });

    const result = await pool.query(
      'INSERT INTO notifications (user_id, task_id, task_list_id, type, title, message, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      [userId, taskId, taskListId, type, title, message]
    );

    const notification = result.rows[0];

    if (taskListId) {
      const taskListResult = await pool.query(
        'SELECT name FROM task_lists WHERE id = $1',
        [taskListId]
      );

      if (taskListResult.rows.length > 0) {
        notification.task_list_name = taskListResult.rows[0].name;
      }
    }

    io.to(`user_${userId}`).emit('newNotification', notification);
    logger.debug('Notification created and emitted', { notificationId: sanitizeForLog(notification.id) });
    return notification;
  } catch (error) {
    logger.error('Error creating notification', { error: sanitizeForLog(error.message) });
  }
};

// Reminder helper functions
const calculateReminderDatetime = (dueDate, timeValue, timeUnit) => {
  const due = new Date(dueDate);
  const reminder = new Date(due);

  switch (timeUnit) {
    case 'minutes':
      reminder.setMinutes(reminder.getMinutes() - timeValue);
      break;
    case 'hours':
      reminder.setHours(reminder.getHours() - timeValue);
      break;
    case 'days':
      reminder.setDate(reminder.getDate() - timeValue);
      break;
    case 'weeks':
      reminder.setDate(reminder.getDate() - (timeValue * 7));
      break;
  }

  return reminder;
};

const createTaskReminder = async (taskId, userId, reminderData) => {
  const { reminderType, timeValue, timeUnit, reminderDatetime } = reminderData;

  const result = await pool.query(
    `INSERT INTO task_reminders (task_id, user_id, reminder_type, time_value, time_unit, reminder_datetime)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [taskId, userId, reminderType, timeValue, timeUnit, reminderDatetime]
  );

  return result.rows[0];
};

const getTaskReminders = async (taskId) => {
  const result = await pool.query(
    `SELECT * FROM task_reminders
     WHERE task_id = $1
     ORDER BY reminder_datetime ASC`,
    [taskId]
  );

  return result.rows;
};

const deleteTaskReminder = async (reminderId, userId) => {
  const result = await pool.query(
    `DELETE FROM task_reminders
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [reminderId, userId]
  );

  return result.rowCount > 0;
};

const getPendingReminders = async () => {
  const result = await pool.query(
    `SELECT tr.*, t.name as task_name, t.due_date, t.task_list_id, tl.name as task_list_name
     FROM task_reminders tr
     JOIN tasks t ON tr.task_id = t.id
     JOIN task_lists tl ON t.task_list_id = tl.id
     WHERE tr.is_sent = false AND tr.reminder_datetime <= NOW()
     ORDER BY tr.reminder_datetime ASC`
  );

  return result.rows;
};

const markReminderAsSent = async (reminderId) => {
  await pool.query(
    `UPDATE task_reminders
     SET is_sent = true, sent_at = NOW()
     WHERE id = $1`,
    [reminderId]
  );
};

const recalculateTaskReminders = async (taskId, newDueDate) => {
  const reminders = await getTaskReminders(taskId);

  for (const reminder of reminders) {
    const newReminderDatetime = calculateReminderDatetime(newDueDate, reminder.time_value, reminder.time_unit);

    if (newReminderDatetime < new Date()) {
      await pool.query('DELETE FROM task_reminders WHERE id = $1', [reminder.id]);
    } else {
      await pool.query(
        'UPDATE task_reminders SET reminder_datetime = $1 WHERE id = $2',
        [newReminderDatetime, reminder.id]
      );
    }
  }
};

const checkDuplicateReminder = async (taskId, userId, reminderDatetime) => {
  const result = await pool.query(
    `SELECT id FROM task_reminders
     WHERE task_id = $1 AND user_id = $2 AND reminder_datetime = $3`,
    [taskId, userId, reminderDatetime]
  );

  return result.rows.length > 0;
};

const getMissedReminders = async (userId) => {
  const result = await pool.query(
    `SELECT tr.*, t.name as task_name, t.due_date, t.task_list_id, tl.name as task_list_name
     FROM task_reminders tr
     JOIN tasks t ON tr.task_id = t.id
     JOIN task_lists tl ON t.task_list_id = tl.id
     WHERE tr.user_id = $1 AND tr.is_sent = true AND tr.sent_at > NOW() - INTERVAL '7 days'
     ORDER BY tr.sent_at DESC`,
    [userId]
  );

  return result.rows;
};

// Auth routes
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;


    if (!email || typeof email !== 'string' || email.length === 0 ||
        !password || typeof password !== 'string' || password.length === 0 ||
        !name || typeof name !== 'string' || name.length === 0) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!validateEmailFormat(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const sanitizedEmail = sanitizeInput(email.toLowerCase());
    const sanitizedName = sanitizeInput(name);


    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [sanitizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [sanitizedEmail, passwordHash, sanitizedName]
    );

    const user = result.rows[0];
    logger.info('User registered', { userId: sanitizeForLog(user.id), email: sanitizeForLog(user.email) });

    const { accessToken, refreshToken } = generateTokens(user.id);
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    res.status(201).json({
      user,
      token: accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('Registration error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || email.length === 0 ||
        !password || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const sanitizedEmail = sanitizeInput(email.toLowerCase());

    const lockStatus = trackFailedLogin(sanitizedEmail);
    if (lockStatus.locked) {
      securityLog('LOGIN_BLOCKED', {
        email: sanitizedEmail,
        reason: 'Account temporarily locked',
        remainingMinutes: lockStatus.remainingMinutes
      }, req);
      return res.status(429).json({ error: lockStatus.message });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [sanitizedEmail]);
    const user = result.rows[0];

    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      const failedStatus = trackFailedLogin(sanitizedEmail);
      securityLog('LOGIN_FAILURE', {
        email: sanitizedEmail,
        reason: 'Invalid credentials',
        attemptCount: failedStatus.attemptCount,
        remainingAttempts: failedStatus.remainingAttempts
      }, req);

      if (failedStatus.locked) {
        return res.status(429).json({ error: failedStatus.message });
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        remainingAttempts: failedStatus.remainingAttempts
      });
    }

    resetFailedLoginAttempts(sanitizedEmail);
    logger.info('User Login Success', { userId: user.id, email: sanitizedEmail, requestId: req.id });
    securityLog('LOGIN_SUCCESS', { userId: user.id, email: sanitizedEmail }, req);

    const { accessToken, refreshToken } = generateTokens(user.id);
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token: accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error('Login Error', { error: error.message, stack: error.stack, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    logger.debug('Refresh token decoded', { userId: sanitizeForLog(decoded.userId) });

    const user = await pool.query('SELECT * FROM users WHERE id = $1 AND refresh_token = $2',
      [decoded.userId, refreshToken]);

    if (user.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2',
      [newRefreshToken, decoded.userId]);

    res.json({
      token: accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    logger.error('Token refresh error', { error: sanitizeForLog(error.message) });
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// User profile routes
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, dark_mode_preference, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get profile error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { name, avatarUrl, darkModePreference } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (!name || name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({ error: 'Name must be between 1 and 100 characters' });
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(sanitizeInput(name.trim()));
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl && (typeof avatarUrl !== 'string' || avatarUrl.length > 500)) {
        return res.status(400).json({ error: 'Avatar URL must be a valid string under 500 characters' });
      }
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatarUrl || null);
    }

    if (darkModePreference !== undefined) {
      if (typeof darkModePreference !== 'boolean') {
        return res.status(400).json({ error: 'Dark mode preference must be a boolean' });
      }
      updates.push(`dark_mode_preference = $${paramIndex++}`);
      values.push(darkModePreference);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.user.userId);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, dark_mode_preference, avatar_url, created_at`,
      values
    );

    logger.info('Profile updated', { userId: sanitizeForLog(req.user.userId) });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update profile error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.put('/api/user/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const user = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.userId]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.userId]
    );

    logger.info('Password changed', { userId: sanitizeForLog(req.user.userId) });
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Change password error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Task list routes
app.get('/api/task-lists', authenticateToken, async (req, res) => {
  try {
    logger.debug('Getting task lists', { userId: sanitizeForLog(req.user.userId) });
    
    const result = await pool.query(`
      SELECT tl.*, u.name as owner_name,
             COUNT(DISTINCT CASE WHEN tlm.user_id IS NOT NULL THEN tlm.user_id END) as member_count,
             COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN t.id END) as task_count
      FROM task_lists tl
      LEFT JOIN users u ON tl.owner_id = u.id
      LEFT JOIN task_list_members tlm ON tl.id = tlm.task_list_id
      LEFT JOIN tasks t ON tl.id = t.task_list_id
      WHERE tl.owner_id = $1 OR tl.id IN (
        SELECT task_list_id FROM task_list_members WHERE user_id = $1
      )
      GROUP BY tl.id, u.name
      ORDER BY tl.created_at DESC
    `, [req.user.userId]);

    logger.debug('Found task lists', { count: result.rows.length, userId: sanitizeForLog(req.user.userId) });
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Get task lists error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to fetch task lists' });
  }
});

app.post('/api/task-lists', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    const { error } = schemas.taskList.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      return res.status(400).json({ error: errorMessage });
    }
    
    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : null;
    const inviteCode = generateInviteCode();
    
    logger.debug('Creating task list', { userId: sanitizeForLog(req.user.userId), name: sanitizeForLog(sanitizedName) });
    
    const result = await pool.query(
      'INSERT INTO task_lists (name, description, owner_id, invite_code) VALUES ($1, $2, $3, $4) RETURNING *',
      [sanitizedName, sanitizedDescription, req.user.userId, inviteCode]
    );

    const taskListId = result.rows[0].id;
    logger.debug('Task list created', { taskListId: sanitizeForLog(taskListId), userId: sanitizeForLog(req.user.userId) });

    await pool.query(
      'INSERT INTO task_list_members (task_list_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
      [taskListId, req.user.userId, 'owner']
    );

    logger.debug('Member added to task list', { taskListId: sanitizeForLog(taskListId), userId: sanitizeForLog(req.user.userId) });


    const enrichedResult = await pool.query(`
      SELECT tl.*, u.name as owner_name,
             COUNT(DISTINCT CASE WHEN tlm.user_id IS NOT NULL THEN tlm.user_id END) as member_count,
             COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN t.id END) as task_count
      FROM task_lists tl
      LEFT JOIN users u ON tl.owner_id = u.id
      LEFT JOIN task_list_members tlm ON tl.id = tlm.task_list_id
      LEFT JOIN tasks t ON tl.id = t.task_list_id
      WHERE tl.id = $1
      GROUP BY tl.id, u.name
    `, [taskListId]);

    logger.debug('Task list enriched with owner data', { taskListId: sanitizeForLog(taskListId) });
    
    res.status(201).json(enrichedResult.rows[0]);
  } catch (error) {
    logger.error('Create task list error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to create task list' });
  }
});

app.delete('/api/task-lists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    logger.debug('Deleting task list', { taskListId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });


    const ownerCheck = await pool.query(
      'SELECT id, owner_id FROM task_lists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task list not found' });
    }
    
    const taskList = ownerCheck.rows[0];
    
    if (taskList.owner_id !== req.user.userId) {
      securityLog('ACCESS_DENIED', {
        reason: 'Non-owner attempted to delete task list',
        taskListId: id,
        ownerId: taskList.owner_id
      }, req);
      return res.status(403).json({ error: 'Only the owner can delete this task list' });
    }

    await pool.query('DELETE FROM task_lists WHERE id = $1', [id]);

    logger.info('Task list deleted', { taskListId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });
    securityLog('TASK_LIST_DELETED', { taskListId: id }, req);

    res.json({ message: 'Task list deleted successfully' });
  } catch (error) {
    logger.error('Delete task list error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to delete task list' });
  }
});

app.post('/api/task-lists/join', authenticateToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }
    
    logger.debug('User joining task list', { userId: sanitizeForLog(req.user.userId), inviteCode: sanitizeForLog(inviteCode) });
    
    const sanitizedCode = sanitizeInput(inviteCode.toUpperCase());
    
    const taskListResult = await pool.query(
      'SELECT * FROM task_lists WHERE invite_code = $1',
      [sanitizedCode]
    );

    if (taskListResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    const taskList = taskListResult.rows[0];

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [taskList.id, req.user.userId]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Already a member of this task list' });
    }

    await pool.query(
      'INSERT INTO task_list_members (task_list_id, user_id) VALUES ($1, $2)',
      [taskList.id, req.user.userId]
    );

    logger.info('User joined task list', { userId: sanitizeForLog(req.user.userId), taskListId: sanitizeForLog(taskList.id) });

    res.json({ message: 'Successfully joined task list', taskList });
  } catch (error) {
    logger.error('Join task list error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to join task list' });
  }
});

// Notification routes
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    logger.debug('Getting notifications', { userId: sanitizeForLog(req.user.userId) });
    
    const result = await pool.query(`
      SELECT n.*, t.name as task_name, tl.name as task_list_name
      FROM notifications n
      LEFT JOIN tasks t ON n.task_id = t.id
      LEFT JOIN task_lists tl ON n.task_list_id = tl.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [req.user.userId]);

    const notifications = result.rows.map(notification => ({
      ...notification,
      created_at: new Date(notification.created_at).toISOString()
    }));

    res.json(notifications);
  } catch (error) {
    logger.error('Get notifications error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = FALSE',
      [req.user.userId]
    );
    
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    logger.error('Get unread count error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Mark notification read error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.put('/api/notifications/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
      [req.user.userId]
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all read error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

app.delete('/api/notifications/clear-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE user_id = $1',
      [req.user.userId]
    );
    
    res.json({ message: 'All notifications cleared' });
  } catch (error) {
    logger.error('Clear all notifications error', { error: sanitizeForLog(error.message), userId: sanitizeForLog(req.user.userId) });
    res.status(500).json({ error: 'Failed to clear all notifications' });
  }
});

app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    logger.error('Delete notification error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.get('/api/task-lists/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url, tlm.role, tlm.joined_at
      FROM task_list_members tlm
      JOIN users u ON tlm.user_id = u.id
      WHERE tlm.task_list_id = $1
      ORDER BY tlm.joined_at ASC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    logger.error('Get members error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Task routes
app.get('/api/task-lists/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;


    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
             assigned_user.avatar_url as assigned_to_avatar_url,
             creator.name as created_by_name,
             utq.queue_position,
             (SELECT MIN(tr.reminder_datetime)
              FROM task_reminders tr
              WHERE tr.task_id = t.id AND tr.is_sent = false) as next_reminder_datetime
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN user_task_queue utq ON t.id = utq.task_id AND utq.user_id = $2
      WHERE t.task_list_id = $1
      ORDER BY t.created_at DESC
    `, [id, req.user.userId]);

    res.json(result.rows);
  } catch (error) {
    logger.error('Get tasks error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/task-lists/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, projectId, requesterId, priority, assignedTo, dueDate, estimatedHours } = req.body;

    const { error } = schemas.task.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      return res.status(400).json({ error: errorMessage });
    }

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let processedAssignedTo = null;
    if (assignedTo !== null && assignedTo !== undefined && assignedTo !== "") {
      const assignedToId = parseInt(assignedTo);
      if (!isNaN(assignedToId)) {
        const assignedMemberCheck = await pool.query(
          'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
          [id, assignedToId]
        );
        
        if (assignedMemberCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Assigned user is not a member of this task list' });
        }
        processedAssignedTo = assignedToId;
      }
    }

    if (estimatedHours !== null && estimatedHours !== undefined && estimatedHours !== "") {
      const hours = parseFloat(estimatedHours);
      if (isNaN(hours) || hours < 0 || hours > 999) {
        return res.status(400).json({ error: 'Estimated hours must be between 0 and 999' });
      }
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : null;
    logger.debug('Creating task', { assignedTo: processedAssignedTo });

    const result = await pool.query(
      `INSERT INTO tasks (name, description, task_list_id, project_id, requester_id, 
       priority, assigned_to, due_date, estimated_hours, created_by, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [sanitizedName, sanitizedDescription, id, projectId || null, requesterId || null, 
       priority || 'medium', processedAssignedTo, dueDate || null, 
       estimatedHours || null, req.user.userId]
    );

    const taskResult = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
             assigned_user.avatar_url as assigned_to_avatar_url,
             creator.name as created_by_name,
             tl.name as task_list_name, utq.queue_position,
             (SELECT MIN(tr.reminder_datetime)
              FROM task_reminders tr
              WHERE tr.task_id = t.id AND tr.is_sent = false) as next_reminder_datetime
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN task_lists tl ON t.task_list_id = tl.id
      LEFT JOIN user_task_queue utq ON t.id = utq.task_id AND utq.user_id = $2
      WHERE t.id = $1
    `, [result.rows[0].id, req.user.userId]);

    const newTask = taskResult.rows[0];

    logger.info('Task created', { taskId: sanitizeForLog(newTask.id), taskListId: sanitizeForLog(id) });

    if (processedAssignedTo && processedAssignedTo !== req.user.userId) {
      try {
        await createNotification(
          processedAssignedTo,
          newTask.id,
          newTask.task_list_id,
          'task_assigned',
          'New Task Assigned',
          `You have been assigned to "${newTask.name}" in ${newTask.task_list_name}`
        );
      } catch (notifError) {
        logger.error('Error creating assignment notification', { error: sanitizeForLog(notifError.message) });
      }
    }

    io.to(`taskList_${id}`).emit('taskCreated', newTask);

    res.status(201).json(newTask);
  } catch (error) {
    logger.error('Create task error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    logger.debug('Updating task', { taskId: sanitizeForLog(id) });

    const { error } = schemas.task.validate(updates, { abortEarly: false, allowUnknown: true });
    if (error) {
      logger.warn('Task validation error', { error: sanitizeForLog(error.message) });
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      return res.status(400).json({ error: errorMessage });
    }
    logger.debug('Task validation passed');

    const originalTaskResult = await pool.query(
      'SELECT assigned_to, task_list_id, due_date, status FROM tasks WHERE id = $1',
      [id]
    );

    if (originalTaskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const originalTask = originalTaskResult.rows[0];

    const validUpdates = {};
    const allowedFields = [
      'name', 'description', 'status', 'priority',
      'due_date', 'estimated_hours', 'estimatedHours', 'project_id', 'projectId',
      'requester_id', 'requesterId', 'assigned_to', 'assignedTo', 'day_assigned', 'dayAssigned'
    ];

    const toSnakeCase = (str) => {
      return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    };


    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        const dbKey = toSnakeCase(key);
        if (typeof updates[key] === 'string') {
          validUpdates[dbKey] = sanitizeInput(updates[key]);
        } else {
          validUpdates[dbKey] = updates[key];
        }
      }
    });

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    logger.debug('Valid updates prepared', { fields: Object.keys(validUpdates) });

    const setClause = Object.keys(validUpdates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = [id, ...Object.values(validUpdates)];
    logger.debug('SQL SET clause generated');
    logger.debug('SQL values prepared', { valueCount: values.length });

    const query = `UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    logger.debug('Final query prepared');

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    logger.debug('Task updated in database', { taskId: sanitizeForLog(result.rows[0].id) });

    const taskResult = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
             assigned_user.avatar_url as assigned_to_avatar_url,
             creator.name as created_by_name,
             utq.queue_position,
             (SELECT MIN(tr.reminder_datetime)
              FROM task_reminders tr
              WHERE tr.task_id = t.id AND tr.is_sent = false) as next_reminder_datetime
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN user_task_queue utq ON t.id = utq.task_id AND utq.user_id = $2
      WHERE t.id = $1
    `, [id, req.user.userId]);

    const updatedTask = taskResult.rows[0];

    logger.info('Task update complete', { taskId: sanitizeForLog(updatedTask.id) });

    if (validUpdates.assigned_to !== undefined &&
        validUpdates.assigned_to !== originalTask.assigned_to &&
        validUpdates.assigned_to !== req.user.userId) {

      try {
        const taskListResult = await pool.query(
          'SELECT tl.name FROM task_lists tl WHERE tl.id = $1',
          [originalTask.task_list_id]
        );

        if (taskListResult.rows.length > 0 && validUpdates.assigned_to) {
          await createNotification(
            validUpdates.assigned_to,
            updatedTask.id,
            updatedTask.task_list_id,
            'task_assigned',
            'Task Assignment Update',
            `You have been assigned to "${updatedTask.name}" in ${taskListResult.rows[0].name}`
          );
        }
      } catch (notifError) {
        logger.error('Error creating assignment notification', { error: sanitizeForLog(notifError.message) });
      }
    }

    // Handle reminder updates
    if (validUpdates.due_date && validUpdates.due_date !== originalTask.due_date) {
      try {
        await recalculateTaskReminders(id, validUpdates.due_date);
        logger.debug('Reminders recalculated after due date change', { taskId: sanitizeForLog(id) });
      } catch (reminderError) {
        logger.error('Error recalculating reminders', { error: sanitizeForLog(reminderError.message) });
      }
    }

    // Delete unsent reminders if task is marked as completed
    if (validUpdates.status === true && originalTask.status === false) {
      try {
        await pool.query('DELETE FROM task_reminders WHERE task_id = $1 AND is_sent = false', [id]);
        logger.debug('Deleted unsent reminders for completed task', { taskId: sanitizeForLog(id) });
      } catch (reminderError) {
        logger.error('Error deleting reminders for completed task', { error: sanitizeForLog(reminderError.message) });
      }
    }

    const taskListId = updatedTask.task_list_id;
    io.to(`taskList_${taskListId}`).emit('taskUpdated', updatedTask);

    res.json(updatedTask);
  } catch (error) {
    logger.error('Update task error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING task_list_id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const taskListId = result.rows[0].task_list_id;

    const renumberResult = await pool.query(`
      UPDATE user_task_queue utq
      SET queue_position = subquery.new_position
      FROM (
        SELECT
          utq2.user_id,
          utq2.task_id,
          ROW_NUMBER() OVER (PARTITION BY utq2.user_id ORDER BY utq2.queue_position) as new_position
        FROM user_task_queue utq2
        JOIN tasks t ON utq2.task_id = t.id
        WHERE t.task_list_id = $1
      ) AS subquery
      WHERE utq.user_id = subquery.user_id AND utq.task_id = subquery.task_id
      RETURNING utq.user_id, utq.task_id, utq.queue_position
    `, [taskListId]);

    logger.info('Renumbered queue positions for all users after task deletion', {
      taskListId,
      totalUpdates: renumberResult.rowCount
    });

    io.to(`taskList_${taskListId}`).emit('taskDeleted', { id: parseInt(id) });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    logger.error('Delete task error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Reminder routes
app.post('/api/tasks/:id/reminders', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const reminders = Array.isArray(req.body) ? req.body : [req.body];

    const taskResult = await pool.query('SELECT due_date, task_list_id FROM tasks WHERE id = $1', [id]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    if (!task.due_date) {
      return res.status(400).json({ error: 'Cannot set reminders on tasks without a due date' });
    }

    const createdReminders = [];

    for (const reminderData of reminders) {
      const { error, value } = schemas.reminder.validate(reminderData);

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { reminderType, timeValue, timeUnit } = value;
      const reminderDatetime = calculateReminderDatetime(task.due_date, timeValue, timeUnit);

      if (reminderDatetime < new Date()) {
        return res.status(400).json({ error: 'Reminder time cannot be in the past' });
      }

      const isDuplicate = await checkDuplicateReminder(id, req.user.userId, reminderDatetime);

      if (isDuplicate) {
        return res.status(400).json({ error: 'A reminder already exists for this time' });
      }

      const reminder = await createTaskReminder(id, req.user.userId, {
        reminderType,
        timeValue,
        timeUnit,
        reminderDatetime
      });

      createdReminders.push(reminder);
    }

    logger.info('Reminders created', {
      taskId: sanitizeForLog(id),
      count: createdReminders.length
    });

    res.status(201).json(createdReminders);
  } catch (error) {
    logger.error('Create reminder error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

app.get('/api/tasks/:id/reminders', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const reminders = await getTaskReminders(id);

    res.json(reminders);
  } catch (error) {
    logger.error('Get reminders error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

app.delete('/api/tasks/:taskId/reminders/:reminderId', authenticateToken, async (req, res) => {
  try {
    const { taskId, reminderId } = req.params;

    const deleted = await deleteTaskReminder(reminderId, req.user.userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Reminder not found or unauthorized' });
    }

    logger.info('Reminder deleted', {
      reminderId: sanitizeForLog(reminderId),
      taskId: sanitizeForLog(taskId)
    });

    res.json({ message: 'Reminder deleted successfully' });
  } catch (error) {
    logger.error('Delete reminder error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

app.get('/api/reminders/missed', authenticateToken, async (req, res) => {
  try {
    const missedReminders = await getMissedReminders(req.user.userId);

    res.json(missedReminders);
  } catch (error) {
    logger.error('Get missed reminders error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch missed reminders' });
  }
});

// Project and requester routes
app.get('/api/task-lists/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM projects WHERE task_list_id = $1 ORDER BY name',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.post('/api/task-lists/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    const sanitizedName = sanitizeInput(name);
    
    const result = await pool.query(
      'INSERT INTO projects (name, task_list_id) VALUES ($1, $2) RETURNING *',
      [sanitizedName, id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.get('/api/task-lists/:id/requesters', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM requesters WHERE task_list_id = $1 ORDER BY name',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requesters' });
  }
});

app.post('/api/task-lists/:id/requesters', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Requester name is required' });
    }
    
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email ? sanitizeInput(email) : null;
    
    if (sanitizedEmail && !validateEmailFormat(sanitizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const result = await pool.query(
      'INSERT INTO requesters (name, email, task_list_id) VALUES ($1, $2, $3) RETURNING *',
      [sanitizedName, sanitizedEmail, id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create requester' });
  }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    logger.debug('Deleting project', { projectId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });


    const projectCheck = await pool.query(
      'SELECT p.*, tl.owner_id FROM projects p JOIN task_lists tl ON p.task_list_id = tl.id WHERE p.id = $1',
      [id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }


    const project = projectCheck.rows[0];

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [project.task_list_id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    logger.info('Project deleted', { projectId: sanitizeForLog(id) });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    logger.error('Delete project error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Queue routes
app.get('/api/users/:userId/queue', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskListId } = req.query;

    if (parseInt(userId) !== req.user.userId) {
      securityLog('ACCESS_DENIED', {
        reason: 'User attempting to access another user\'s queue',
        requestedUserId: userId,
        actualUserId: req.user.userId
      }, req);
      return res.status(403).json({ error: 'Access denied' });
    }

    if (taskListId) {
      const memberCheck = await pool.query(
        'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
        [taskListId, req.user.userId]
      );

      if (memberCheck.rows.length === 0) {
        securityLog('ACCESS_DENIED', {
          reason: 'User not a member of requested task list',
          taskListId,
          userId: req.user.userId
        }, req);
        return res.status(403).json({ error: 'Access denied - not a member of this task list' });
      }
    }

    let query, params;
    if (taskListId) {
      query = `
        SELECT t.*, p.name as project_name, r.name as requester_name,
               assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
               assigned_user.avatar_url as assigned_to_avatar_url,
               creator.name as created_by_name,
               utq.queue_position, utq.added_at as queued_at
        FROM user_task_queue utq
        JOIN tasks t ON utq.task_id = t.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN requesters r ON t.requester_id = r.id
        LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
        LEFT JOIN users creator ON t.created_by = creator.id
        WHERE utq.user_id = $1 AND t.task_list_id = $2
        ORDER BY utq.queue_position ASC
      `;
      params = [userId, taskListId];
    } else {
      query = `
        SELECT t.*, p.name as project_name, r.name as requester_name,
               assigned_user.name as assigned_to_name, assigned_user.email as assigned_to_email,
               assigned_user.avatar_url as assigned_to_avatar_url,
               creator.name as created_by_name,
               utq.queue_position, utq.added_at as queued_at
        FROM user_task_queue utq
        JOIN tasks t ON utq.task_id = t.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN requesters r ON t.requester_id = r.id
        LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
        LEFT JOIN users creator ON t.created_by = creator.id
        WHERE utq.user_id = $1
        ORDER BY utq.queue_position ASC
      `;
      params = [userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

app.post('/api/users/:userId/queue', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskId } = req.body;

    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const taskResult = await pool.query(
      'SELECT task_list_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const taskListId = taskResult.rows[0].task_list_id;

    const maxPosResult = await pool.query(`
      SELECT COALESCE(MAX(utq.queue_position), 0) as max_pos
      FROM user_task_queue utq
      JOIN tasks t ON utq.task_id = t.id
      WHERE utq.user_id = $1 AND t.task_list_id = $2
    `, [userId, taskListId]);

    const newPosition = maxPosResult.rows[0].max_pos + 1;

    await pool.query(
      'INSERT INTO user_task_queue (user_id, task_id, queue_position) VALUES ($1, $2, $3) ON CONFLICT (user_id, task_id) DO NOTHING',
      [userId, taskId, newPosition]
    );

    const result = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, creator.name as created_by_name,
             utq.queue_position, utq.added_at as queued_at
      FROM user_task_queue utq
      JOIN tasks t ON utq.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      WHERE utq.user_id = $1 AND utq.task_id = $2
    `, [userId, taskId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Add to queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to add task to queue' });
  }
});

app.put('/api/users/:userId/queue/reorder', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskOrders } = req.body;

    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }


    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const { taskId, position } of taskOrders) {
        await client.query(
          'UPDATE user_task_queue SET queue_position = $1 WHERE user_id = $2 AND task_id = $3',
          [position, userId, taskId]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Queue reordered successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Reorder queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to reorder queue' });
  }
});

app.delete('/api/users/:userId/queue/:taskId', authenticateToken, queueLimiter, async (req, res) => {
  try {
    const { userId, taskId } = req.params;

    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }


    const taskInfoResult = await pool.query(`
      SELECT utq.queue_position, t.task_list_id
      FROM user_task_queue utq
      JOIN tasks t ON utq.task_id = t.id
      WHERE utq.user_id = $1 AND utq.task_id = $2
    `, [userId, taskId]);

    if (taskInfoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not in queue' });
    }

    const removedPosition = taskInfoResult.rows[0].queue_position;
    const taskListId = taskInfoResult.rows[0].task_list_id;

    logger.info('Removing task from queue', {
      userId,
      taskId,
      removedPosition,
      taskListId
    });

    await pool.query(
      'DELETE FROM user_task_queue WHERE user_id = $1 AND task_id = $2',
      [userId, taskId]
    );

    const updateResult = await pool.query(`
      UPDATE user_task_queue
      SET queue_position = queue_position - 1
      WHERE user_id = $1
        AND task_id IN (
          SELECT t.id
          FROM tasks t
          WHERE t.task_list_id = $2
        )
        AND queue_position > $3
      RETURNING task_id, queue_position
    `, [userId, taskListId, removedPosition]);

    logger.info('Updated queue positions after deletion', {
      updatedCount: updateResult.rowCount,
      updatedTasks: updateResult.rows
    });

    const renumberResult = await pool.query(`
      UPDATE user_task_queue utq
      SET queue_position = subquery.new_position
      FROM (
        SELECT
          utq2.task_id,
          ROW_NUMBER() OVER (ORDER BY utq2.queue_position) as new_position
        FROM user_task_queue utq2
        JOIN tasks t ON utq2.task_id = t.id
        WHERE utq2.user_id = $1 AND t.task_list_id = $2
      ) AS subquery
      WHERE utq.user_id = $1 AND utq.task_id = subquery.task_id
      RETURNING utq.task_id, utq.queue_position
    `, [userId, taskListId]);

    logger.info('Renumbered queue positions in single query', {
      renumberedCount: renumberResult.rowCount,
      finalPositions: renumberResult.rows
    });

    res.json({
      message: 'Task removed from queue',
      updatedPositions: renumberResult.rows
    });
  } catch (error) {
    logger.error('Remove from queue error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to remove task from queue' });
  }
});

app.delete('/api/requesters/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    logger.debug('Deleting requester', { requesterId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });


    const requesterCheck = await pool.query(
      'SELECT r.*, tl.owner_id FROM requesters r JOIN task_lists tl ON r.task_list_id = tl.id WHERE r.id = $1',
      [id]
    );
    
    if (requesterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Requester not found' });
    }

    const requester = requesterCheck.rows[0];

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [requester.task_list_id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM requesters WHERE id = $1', [id]);
    logger.info('Requester deleted', { requesterId: sanitizeForLog(id) });

    res.json({ message: 'Requester deleted successfully' });
  } catch (error) {
    logger.error('Delete requester error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete requester' });
  }
});

// WebSocket handlers
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

// Daily database keep-alive
cron.schedule('0 3 * * *', async () => {
  try {
    logger.debug('Running database keep-alive ping');
    await pool.query('SELECT 1');
    logger.debug('Database keep-alive ping successful');
  } catch (error) {
    logger.error('Database keep-alive ping failed', { error: sanitizeForLog(error.message) });
  }
});

// Reminder scheduler (runs every minute)
cron.schedule('* * * * *', async () => {
  try {
    const pendingReminders = await getPendingReminders();

    if (pendingReminders.length > 0) {
      logger.info('Processing pending reminders', { count: pendingReminders.length });
    }

    for (const reminder of pendingReminders) {
      try {
        const dueDate = new Date(reminder.due_date);
        const formattedDueDate = dueDate.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        await createNotification(
          reminder.user_id,
          reminder.task_id,
          reminder.task_list_id,
          'task_reminder',
          `Reminder: ${reminder.task_name}`,
          `Due ${formattedDueDate}`
        );

        await markReminderAsSent(reminder.id);

        logger.debug('Reminder processed and sent', {
          reminderId: sanitizeForLog(reminder.id),
          taskId: sanitizeForLog(reminder.task_id),
          userId: sanitizeForLog(reminder.user_id)
        });
      } catch (reminderError) {
        logger.error('Error processing individual reminder', {
          reminderId: sanitizeForLog(reminder.id),
          error: sanitizeForLog(reminderError.message)
        });
      }
    }
  } catch (error) {
    logger.error('Reminder scheduler error', { error: sanitizeForLog(error.message) });
  }
});

// Start server
initDatabase().then(() => {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info('Database keep-alive job scheduled (daily at 3 AM)');
  });
});

module.exports = app;