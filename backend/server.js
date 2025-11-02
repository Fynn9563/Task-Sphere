require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { logger, requestIdMiddleware, httpLoggerMiddleware } = require('./utils/logger');
const { pool, initDatabase } = require('./config/database');
const { applySecurityMiddleware } = require('./middleware/security');
const { limiter } = require('./middleware/rateLimiter');
const { initializeSocketHandlers } = require('./websocket/socketHandlers');
const { initializeScheduledJobs } = require('./utils/scheduler');
const { createNotification } = require('./services/notification.service');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Parse allowed origins from environment variable
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Apply security middleware
applySecurityMiddleware(app);

// Apply rate limiting
app.use('/api/', limiter);

// Apply general middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);
app.use(express.static('public'));

// Health check routes
app.get('/', (req, res) => {
  res.json({ message: 'Task Sphere API is running!' });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Import and mount route modules
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const taskListRoutes = require('./routes/taskList.routes');
const taskRoutes = require('./routes/task.routes');
const reminderRoutes = require('./routes/reminder.routes');
const notificationRoutes = require('./routes/notification.routes');
const projectRoutes = require('./routes/project.routes');
const requesterRoutes = require('./routes/requester.routes');
const queueRoutes = require('./routes/queue.routes');

// Pass io instance to routes for real-time updates
taskRoutes.setIO(io);
reminderRoutes.setIO(io);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/task-lists', taskListRoutes);
app.use('/api', taskRoutes);
app.use('/api', reminderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', projectRoutes);
app.use('/api', requesterRoutes);
app.use('/api/users', queueRoutes);

// Mount test routes only in development
if (process.env.NODE_ENV === 'development') {
  const testRoutes = require('./routes/test.routes');
  testRoutes.setIO(io);
  app.use('/api/test', testRoutes);
  logger.info('Test routes enabled (development mode)');
}

// Initialize WebSocket handlers
initializeSocketHandlers(io);

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await initDatabase();

    // Initialize scheduled jobs
    await initializeScheduledJobs(
      pool,
      io,
      (userId, taskId, taskListId, type, title, message) =>
        createNotification(pool, io, userId, taskId, taskListId, type, title, message)
    );

    // Start HTTP server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

startServer();

module.exports = app;
