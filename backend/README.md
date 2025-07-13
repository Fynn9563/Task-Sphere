# Task Sphere Backend

The Task Sphere backend powers user authentication, task list and task management, real-time updates, and notifications. It exposes a simple REST and WebSocket API for the frontend to interact with.

## What You Can Do

* **User Authentication**

  * Register new users and log in securely with JWT tokens.
  * Refresh expired tokens.

* **Task List Management**

  * Create, list, and delete task lists.
  * Share lists via invite codes.

* **Task Operations**

  * Add, update, and remove tasks with details like name, description, status, priority, and due date.
  * Assign tasks to team members, projects, and requesters.

* **Real-Time Updates**

  * Receive live task and notification events via WebSockets (Socket.io).

* **Notifications**

  * Automatically generate in-app notifications for task assignments and changes.
  * Retrieve and mark notifications as read.

## Getting Started

1. **Clone the Backend Folder**

   ```bash
   git clone https://github.com/Fynn9563/Task-Sphere.git
   cd Task-Sphere/backend
   ```

2. **Install Dependencies**

   ```bash
   pnpm install
   # or npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the `backend/` folder with:

   ```env
   DATABASE_URL=postgresql://user:password@host:5432/tasksphere_db
   NODE_ENV=development

   JWT_SECRET=your_jwt_secret_here
   JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

   FRONTEND_URL=http://localhost:5173

   PORT=5000

   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   ENABLE_CORS=true
   TRUST_PROXY=false

   LOG_LEVEL=info
   ```

   **Variable Descriptions:**

   * `DATABASE_URL`: PostgreSQL connection string (e.g. `postgres://user:pass@host:port/dbname`).
   * `NODE_ENV`: Application mode, either `development` or `production`.
   * `JWT_SECRET`: Secret key for signing access tokens (15-minute expiry).
   * `JWT_REFRESH_SECRET`: Secret key for signing refresh tokens (7-day expiry).
   * `FRONTEND_URL`: URL of your frontend app for CORS (e.g. `http://localhost:5173` or your Netlify domain).
   * `PORT`: Port number the server listens on (default `5000`).
   * `RATE_LIMIT_WINDOW_MS`: Time window in milliseconds for rate limiting (default `900000` = 15 minutes).
   * `RATE_LIMIT_MAX_REQUESTS`: Maximum number of requests per IP per window (default `100`).
   * `ENABLE_CORS`: Set to `true` to enable CORS middleware.
   * `TRUST_PROXY`: Set to `true` if running behind a proxy to trust `X-Forwarded-*` headers.
   * `LOG_LEVEL`: Logging verbosity (`error`, `warn`, `info`, `debug`).

## API Endpoints

The backend exposes REST endpoints under `/api/` for authentication, task lists, tasks, and notifications. WebSocket events use namespaces `user_<id>` and `taskList_<id>`.

Refer to the code comments for full endpoint and event details.