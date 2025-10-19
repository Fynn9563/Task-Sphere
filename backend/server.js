const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Server } = require('socket.io');
const http = require('http');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Trust Proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
};

// Sanitization helper
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return validator.escape(input.trim());
};

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Task Sphere API is running!' });
});

// Health check route
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// JWT middleware with refresh token support
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err);
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ error: 'Token expired', needsRefresh: true });
      }
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.log('JWT decoded user:', user);
    req.user = user;
    next();
  });
};

// Debug route to check auth
app.get('/api/debug/auth', authenticateToken, (req, res) => {
  res.json({ 
    message: 'Auth working',
    user: req.user,
    userId: req.user.userId 
  });
});

// Database initialization
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
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

// Helper functions
const generateInviteCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const generateTokens = (userId) => {
  console.log('Generating tokens for user ID:', userId);
  const accessToken = jwt.sign({ userId: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// Helper function to create notifications
const createNotification = async (userId, taskId, taskListId, type, title, message) => {
  try {
    console.log('Creating notification:', { userId, taskId, taskListId, type, title, message });
    
    const result = await pool.query(
      'INSERT INTO notifications (user_id, task_id, task_list_id, type, title, message, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      [userId, taskId, taskListId, type, title, message]
    );
    
    const notification = result.rows[0];
    
    // Get additional task list info for the notification
    if (taskListId) {
      const taskListResult = await pool.query(
        'SELECT name FROM task_lists WHERE id = $1',
        [taskListId]
      );
      
      if (taskListResult.rows.length > 0) {
        notification.task_list_name = taskListResult.rows[0].name;
      }
    }
    
    // Emit real-time notification with proper timestamp
    io.to(`user_${userId}`).emit('newNotification', notification);
    
    console.log('Notification created and emitted:', notification);
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Sanitize inputs
    const sanitizedEmail = sanitizeInput(email.toLowerCase());
    const sanitizedName = sanitizeInput(name);
    
    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [sanitizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);
    
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [sanitizedEmail, passwordHash, sanitizedName]
    );

    const user = result.rows[0];
    console.log('Created user:', user);
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Update user with refresh token
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);
    
    res.status(201).json({ 
      user, 
      token: accessToken,
      refreshToken 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const sanitizedEmail = sanitizeInput(email.toLowerCase());
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [sanitizedEmail]);
    const user = result.rows[0];

    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('User logging in:', { id: user.id, email: user.email });
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Update refresh token in database
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    res.json({ 
      user: { id: user.id, email: user.email, name: user.name }, 
      token: accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token route
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    console.log('Refresh token decoded:', decoded);
    
    // Check if refresh token exists in database
    const user = await pool.query('SELECT * FROM users WHERE id = $1 AND refresh_token = $2', 
      [decoded.userId, refreshToken]);
      
    if (user.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);
    
    // Update refresh token in database
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', 
      [newRefreshToken, decoded.userId]);
    
    res.json({ 
      token: accessToken, 
      refreshToken: newRefreshToken 
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// Task List Routes
app.get('/api/task-lists', authenticateToken, async (req, res) => {
  try {
    console.log('Getting task lists for user:', req.user.userId);
    console.log('User object:', req.user);
    
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

    console.log('Found task lists:', result.rows.length);
    result.rows.forEach(list => {
      console.log(`List "${list.name}": owner_id=${list.owner_id}, current_user=${req.user.userId}, is_owner=${list.owner_id === req.user.userId}`);
    });
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get task lists error:', error);
    res.status(500).json({ error: 'Failed to fetch task lists' });
  }
});

app.post('/api/task-lists', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Task list name is required' });
    }
    
    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : null;
    const inviteCode = generateInviteCode();
    
    console.log('Creating task list for user:', req.user.userId);
    
    const result = await pool.query(
      'INSERT INTO task_lists (name, description, owner_id, invite_code) VALUES ($1, $2, $3, $4) RETURNING *',
      [sanitizedName, sanitizedDescription, req.user.userId, inviteCode]
    );

    const taskListId = result.rows[0].id;
    console.log('Created task list with ID:', taskListId);

    // Add owner as member
    const memberResult = await pool.query(
      'INSERT INTO task_list_members (task_list_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
      [taskListId, req.user.userId, 'owner']
    );
    
    console.log('Added member:', memberResult.rows[0]);

    // Return enriched data with same format as getTaskLists
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

    console.log('Enriched result:', enrichedResult.rows[0]);
    
    res.status(201).json(enrichedResult.rows[0]);
  } catch (error) {
    console.error('Create task list error:', error);
    res.status(500).json({ error: 'Failed to create task list' });
  }
});

// Delete task list route
app.delete('/api/task-lists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Deleting task list:', id, 'by user:', req.user.userId);
    
    // Check if user is the owner of this task list
    const ownerCheck = await pool.query(
      'SELECT id, owner_id FROM task_lists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task list not found' });
    }
    
    const taskList = ownerCheck.rows[0];
    
    if (taskList.owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner can delete this task list' });
    }
    
    // Delete the task list (CASCADE will handle related data)
    await pool.query('DELETE FROM task_lists WHERE id = $1', [id]);
    
    console.log('Task list deleted successfully:', id);
    
    res.json({ message: 'Task list deleted successfully' });
  } catch (error) {
    console.error('Delete task list error:', error);
    res.status(500).json({ error: 'Failed to delete task list' });
  }
});

// Join task list via invite code
app.post('/api/task-lists/join', authenticateToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }
    
    console.log('User', req.user.userId, 'trying to join with code:', inviteCode);
    
    const sanitizedCode = sanitizeInput(inviteCode.toUpperCase());
    
    const taskListResult = await pool.query(
      'SELECT * FROM task_lists WHERE invite_code = $1',
      [sanitizedCode]
    );

    if (taskListResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    const taskList = taskListResult.rows[0];
    
    // Check if user is already a member
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

    console.log('User', req.user.userId, 'successfully joined task list', taskList.id);

    res.json({ message: 'Successfully joined task list', taskList });
  } catch (error) {
    console.error('Join task list error:', error);
    res.status(500).json({ error: 'Failed to join task list' });
  }
});

// Notifications Routes
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    console.log('Getting notifications for user:', req.user.userId);
    
    const result = await pool.query(`
      SELECT n.*, t.name as task_name, tl.name as task_list_name
      FROM notifications n
      LEFT JOIN tasks t ON n.task_id = t.id
      LEFT JOIN task_lists tl ON n.task_list_id = tl.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [req.user.userId]);

    // Process notifications to ensure proper timestamp format
    const notifications = result.rows.map(notification => ({
      ...notification,
      created_at: new Date(notification.created_at).toISOString()
    }));

    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
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
    console.error('Get unread count error:', error);
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
    console.error('Mark notification read error:', error);
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
    console.error('Mark all read error:', error);
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
    console.error('Clear all notifications error:', error);
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
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.get('/api/task-lists/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify user has access to this task list
    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, tlm.role, tlm.joined_at
      FROM task_list_members tlm
      JOIN users u ON tlm.user_id = u.id
      WHERE tlm.task_list_id = $1
      ORDER BY tlm.joined_at ASC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Tasks Routes
app.get('/api/task-lists/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify user has access to this task list
    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, creator.name as created_by_name,
             utq.queue_position
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
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/task-lists/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, projectId, requesterId, priority, assignedTo, dueDate, estimatedHours } = req.body;
    
    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Task name is required' });
    }
    
    // Verify access
    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Handle assignedTo field properly
    let processedAssignedTo = null;
    if (assignedTo !== null && assignedTo !== undefined && assignedTo !== "") {
      const assignedToId = parseInt(assignedTo);
      if (!isNaN(assignedToId)) {
        // Verify assigned user is a member if assignedTo is provided
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

    // Validate estimated hours
    if (estimatedHours !== null && estimatedHours !== undefined && estimatedHours !== "") {
      const hours = parseFloat(estimatedHours);
      if (isNaN(hours) || hours < 0 || hours > 999) {
        return res.status(400).json({ error: 'Estimated hours must be between 0 and 999' });
      }
    }

    // Sanitize inputs
    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : null;

    console.log('Creating task with processed assignedTo:', processedAssignedTo);

    const result = await pool.query(
      `INSERT INTO tasks (name, description, task_list_id, project_id, requester_id, 
       priority, assigned_to, due_date, estimated_hours, created_by, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [sanitizedName, sanitizedDescription, id, projectId || null, requesterId || null, 
       priority || 'medium', processedAssignedTo, dueDate || null, 
       estimatedHours || null, req.user.userId]
    );

    // Get the complete task with related data (including queue position for creator)
    const taskResult = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, creator.name as created_by_name,
             tl.name as task_list_name, utq.queue_position
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

    console.log('Created task:', newTask);

    // Create notification if task is assigned to someone (and not to the creator)
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
        console.error('Error creating assignment notification:', notifError);
        // Don't fail task creation if notification fails
      }
    }

    // Emit real-time update
    io.to(`taskList_${id}`).emit('taskCreated', newTask);

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    console.log('Updating task:', id, 'with data:', updates);
    
    // Get the original task to check for assignment changes
    const originalTaskResult = await pool.query(
      'SELECT assigned_to, task_list_id FROM tasks WHERE id = $1',
      [id]
    );
    
    if (originalTaskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const originalTask = originalTaskResult.rows[0];
    
    // Validate that we have updates to make
    const validUpdates = {};
    const allowedFields = [
      'name', 'description', 'status', 'priority', 
      'due_date', 'estimated_hours', 'project_id', 'requester_id', 'assigned_to'
    ];
    
    // Filter and sanitize updates
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        if (typeof updates[key] === 'string') {
          validUpdates[key] = sanitizeInput(updates[key]);
        } else {
          validUpdates[key] = updates[key];
        }
      }
    });
    
    // Check if we have any valid updates
    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    console.log('Valid updates:', validUpdates);
    
    // Build dynamic update query with proper parameter indexing
    const setClause = Object.keys(validUpdates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = [id, ...Object.values(validUpdates)];
    
    console.log('SQL SET clause:', setClause);
    console.log('SQL values:', values);
    
    const query = `UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    console.log('Final query:', query);
    
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    console.log('Task updated in database:', result.rows[0]);

    // Get the complete task with related data
    const taskResult = await pool.query(`
      SELECT t.*, p.name as project_name, r.name as requester_name,
             assigned_user.name as assigned_to_name, creator.name as created_by_name,
             utq.queue_position
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN requesters r ON t.requester_id = r.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN user_task_queue utq ON t.id = utq.task_id AND utq.user_id = $2
      WHERE t.id = $1
    `, [id, req.user.userId]);

    const updatedTask = taskResult.rows[0];

    console.log('Complete updated task with relations:', updatedTask);

    // Create notification for task assignment changes
    if (validUpdates.assigned_to !== undefined && 
        validUpdates.assigned_to !== originalTask.assigned_to &&
        validUpdates.assigned_to !== req.user.userId) {
      
      try {
        // Get task list info for notification
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
        console.error('Error creating assignment notification:', notifError);
        // Don't fail the update if notification fails
      }
    }

    // Emit real-time update
    const taskListId = updatedTask.task_list_id;
    io.to(`taskList_${taskListId}`).emit('taskUpdated', updatedTask);

    res.json(updatedTask);
  } catch (error) {
    console.error('Update task error:', error);
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

    // Emit real-time update
    const taskListId = result.rows[0].task_list_id;
    io.to(`taskList_${taskListId}`).emit('taskDeleted', { id: parseInt(id) });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Projects and Requesters Routes
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
    
    if (sanitizedEmail && !validator.isEmail(sanitizedEmail)) {
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

// Delete project route
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Deleting project:', id, 'by user:', req.user.userId);
    
    // First, check if the project exists and get task list info
    const projectCheck = await pool.query(
      'SELECT p.*, tl.owner_id FROM projects p JOIN task_lists tl ON p.task_list_id = tl.id WHERE p.id = $1',
      [id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = projectCheck.rows[0];
    
    // Check if user has permission (owner or member of task list)
    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [project.task_list_id, req.user.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete the project (tasks will be set to NULL due to ON DELETE SET NULL)
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    
    console.log('Project deleted successfully:', id);
    
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Queue Routes
// Get user's task queue
app.get('/api/users/:userId/queue', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user is requesting their own queue
    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
      WHERE utq.user_id = $1
      ORDER BY utq.queue_position ASC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// Add task to queue
app.post('/api/users/:userId/queue', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskId } = req.body;

    // Verify user is modifying their own queue
    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the highest position in the queue
    const maxPosResult = await pool.query(
      'SELECT COALESCE(MAX(queue_position), 0) as max_pos FROM user_task_queue WHERE user_id = $1',
      [userId]
    );

    const newPosition = maxPosResult.rows[0].max_pos + 1;

    // Insert into queue
    await pool.query(
      'INSERT INTO user_task_queue (user_id, task_id, queue_position) VALUES ($1, $2, $3) ON CONFLICT (user_id, task_id) DO NOTHING',
      [userId, taskId, newPosition]
    );

    // Return the full task with queue info
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
    console.error('Add to queue error:', error);
    res.status(500).json({ error: 'Failed to add task to queue' });
  }
});

// Reorder queue (bulk update for drag-drop)
app.put('/api/users/:userId/queue/reorder', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { taskOrders } = req.body; // Array of { taskId, position }

    // Verify user is modifying their own queue
    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use a transaction to update all positions atomically
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
    console.error('Reorder queue error:', error);
    res.status(500).json({ error: 'Failed to reorder queue' });
  }
});

// Remove task from queue
app.delete('/api/users/:userId/queue/:taskId', authenticateToken, async (req, res) => {
  try {
    const { userId, taskId } = req.params;

    // Verify user is modifying their own queue
    if (parseInt(userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the position of the task being removed
    const posResult = await pool.query(
      'SELECT queue_position FROM user_task_queue WHERE user_id = $1 AND task_id = $2',
      [userId, taskId]
    );

    if (posResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not in queue' });
    }

    const removedPosition = posResult.rows[0].queue_position;

    // Remove from queue
    await pool.query(
      'DELETE FROM user_task_queue WHERE user_id = $1 AND task_id = $2',
      [userId, taskId]
    );

    // Adjust positions of tasks that were after the removed task
    await pool.query(
      'UPDATE user_task_queue SET queue_position = queue_position - 1 WHERE user_id = $1 AND queue_position > $2',
      [userId, removedPosition]
    );

    res.json({ message: 'Task removed from queue' });
  } catch (error) {
    console.error('Remove from queue error:', error);
    res.status(500).json({ error: 'Failed to remove task from queue' });
  }
});

// Delete requester route
app.delete('/api/requesters/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Deleting requester:', id, 'by user:', req.user.userId);
    
    // First, check if the requester exists and get task list info
    const requesterCheck = await pool.query(
      'SELECT r.*, tl.owner_id FROM requesters r JOIN task_lists tl ON r.task_list_id = tl.id WHERE r.id = $1',
      [id]
    );
    
    if (requesterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Requester not found' });
    }
    
    const requester = requesterCheck.rows[0];
    
    // Check if user has permission (owner or member of task list)
    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [requester.task_list_id, req.user.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete the requester (tasks will be set to NULL due to ON DELETE SET NULL)
    await pool.query('DELETE FROM requesters WHERE id = $1', [id]);
    
    console.log('Requester deleted successfully:', id);
    
    res.json({ message: 'Requester deleted successfully' });
  } catch (error) {
    console.error('Delete requester error:', error);
    res.status(500).json({ error: 'Failed to delete requester' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join user room for notifications
  socket.on('joinUser', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${socket.id} joined user room ${userId}`);
  });

  // Join task list room
  socket.on('joinTaskList', (taskListId) => {
    socket.join(`taskList_${taskListId}`);
    console.log(`User ${socket.id} joined task list ${taskListId}`);
  });

  // Leave task list room
  socket.on('leaveTaskList', (taskListId) => {
    socket.leave(`taskList_${taskListId}`);
    console.log(`User ${socket.id} left task list ${taskListId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Database keep-alive job - runs once per day at 3 AM
cron.schedule('0 3 * * *', async () => {
  try {
    console.log('🔄 Running database keep-alive ping...');
    await pool.query('SELECT 1');
    console.log('✅ Database keep-alive ping successful');
  } catch (error) {
    console.error('❌ Database keep-alive ping failed:', error);
  }
});

// Initialize database and start server
initDatabase().then(() => {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('⏰ Database keep-alive job scheduled (daily at 3 AM)');
  });
});

module.exports = app;