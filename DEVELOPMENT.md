# Development Guide - Task Sphere

## Prerequisites

Before running the application locally, ensure you have:

- **Node.js** (v18 or higher recommended)
- **pnpm** package manager
- **PostgreSQL** database server running
- **Git** (for version control)

## Initial Setup

### 1. Install Dependencies

Install dependencies for both backend and frontend:

```bash
# Install backend dependencies
cd backend
pnpm install

# Install frontend dependencies
cd ../frontend
pnpm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory with your database and server configuration:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tasksphere
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Server Configuration
PORT=5000
JWT_SECRET=your_jwt_secret_here

# Node Environment
NODE_ENV=development
```

### 3. Database Setup

Ensure your PostgreSQL database is running and the database specified in `.env` exists. The application will handle table creation on first run.

## Running the Application

You need to run both the backend and frontend servers simultaneously in separate terminal windows.

### Terminal 1 - Backend Server

```bash
cd backend
pnpm run dev
```

The backend server will start with nodemon (auto-restart on file changes) on the configured port (default: http://localhost:5000).

### Terminal 2 - Frontend Server

```bash
cd frontend
pnpm run dev
```

The frontend Vite development server will start (usually on http://localhost:5173).

## Available Scripts

### Backend Scripts

- `pnpm start` - Start the production server
- `pnpm run dev` - Start the development server with auto-reload (nodemon)

### Frontend Scripts

- `pnpm run dev` - Start the Vite development server
- `pnpm run build` - Build the production-ready frontend
- `pnpm run preview` - Preview the production build locally
- `pnpm run lint` - Run ESLint to check code quality

## Development Workflow

1. Make sure both servers are running
2. Open your browser to http://localhost:5173
3. Changes to frontend files will auto-reload
4. Changes to backend files will auto-restart the server
5. Check browser console and terminal output for any errors

## Troubleshooting

### Port Already in Use

If you get a "port already in use" error:
- Backend: Change `PORT` in your `.env` file
- Frontend: Vite will usually prompt you to use an alternative port

### Database Connection Errors

- Verify PostgreSQL is running
- Check your `.env` database credentials
- Ensure the database exists

### Module Not Found Errors

Run `pnpm install` in the respective directory (backend or frontend).

### WebSocket Connection Issues

- Ensure backend server is running before starting frontend
- Check that CORS is properly configured in `backend/server.js`
- Verify the `API_BASE_URL` in frontend configuration matches your backend URL

## Project Structure

```
Task-Sphere/
├── backend/          # Node.js/Express backend
│   ├── server.js     # Main server file
│   └── utils/        # Utilities and helpers
├── frontend/         # React/Vite frontend
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   └── utils/
│   └── public/
└── DEVELOPMENT.md    # This file
```

## Tech Stack

### Backend
- Node.js + Express
- PostgreSQL database
- Socket.io for real-time updates
- JWT for authentication
- Winston for logging

### Frontend
- React 19
- Vite build tool
- Tailwind CSS
- Socket.io-client
- Lucide React (icons)
- @dnd-kit (drag & drop)

## Getting Help

If you encounter issues:
1. Check the terminal output for error messages
2. Look at browser console (F12) for frontend errors
3. Verify all environment variables are set correctly
4. Ensure database is accessible and properly configured
