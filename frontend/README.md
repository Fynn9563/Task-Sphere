# Task Sphere Frontend

This repository contains the user interface for Task Sphere, built with React and Vite. It's responsible for signing in, creating lists, managing tasks, and real-time updates.

## Features

* **Sign In/Sign Up**
* **Task List Management**
* **Task CRUD** (create, read, update, delete)
* **Assign & Track** tasks in real time
* **Notifications** bell with unread count
* **Filtering & Sorting** by status, assignee, project

## Quick Start

1. **Install dependencies**

   ```bash
   cd frontend
   pnpm install
   ```

2. **Configure environment**

   * Create a `.env` file in `frontend/` with:

     ```env
     VITE_API_URL=http://localhost:5000
     ```

3. **Run in development**

   ```bash
   pnpm dev
   ```

   * Opens at `http://localhost:5173`

4. **Build for production**

   ```bash
   pnpm build
   ```

   * Output files in `dist/`

5. **Preview production build locally**

   ```bash
   pnpm preview
   ```

## Available Scripts

* `pnpm dev` — start development server with hot reload
* `pnpm build` — bundle app for production
* `pnpm preview` — locally preview production build

## Environment Variables

| Key            | Description          | Default                 |
| -------------- | -------------------- | ----------------------- |
| `VITE_API_URL` | Backend API base URL | `http://localhost:5000` |

## Folder Structure

```
frontend/
├── public/            # Static assets (favicon, index.html)
├── src/
│   ├── api/           # Fetch and socket client
│   ├── components/    # Reusable UI components
│   ├── pages/         # Route-level components
│   ├── styles/        # Global and utility styles
│   ├── App.jsx        # Main app component
│   └── main.jsx       # Entry point
├── .env               # Environment variables
├── index.html         # App HTML template
├── package.json       # Scripts & dependencies
└── vite.config.js     # Vite configuration
```

## Deployment

* **Netlify**: link this folder as Base directory, build `pnpm build`, publish `dist/`, set `VITE_API_URL` in Site Settings.
* **Vercel**: similar setup with framework preset `vite` and env var `VITE_API_URL`.

## Contributing

Feel free to open issues or pull requests with improvements!