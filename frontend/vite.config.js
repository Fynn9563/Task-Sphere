import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import sri from 'vite-plugin-sri'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Task Sphere - Professional Task Management',
        short_name: 'TaskSphere',
        description: 'Professional task management system with real-time collaboration, reminders, and queue management.',
        theme_color: '#2563eb',
        background_color: '#111827',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'any',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'My Tasks',
            short_name: 'Tasks',
            description: 'View all your tasks',
            url: '/',
            icons: [{ src: '/icons/icon.svg', sizes: 'any' }]
          },
          {
            name: 'My Queue',
            short_name: 'Queue',
            description: 'View your task queue',
            url: '/?view=queue',
            icons: [{ src: '/icons/icon.svg', sizes: 'any' }]
          }
        ],
        categories: ['productivity', 'business', 'utilities']
      },
      workbox: {
        // Cache static assets only for faster loading
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            // API routes - always network only (no cache)
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // WebSocket connections - always network only
            urlPattern: /^https?:\/\/.*\/socket\.io\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // External resources (Gravatar, CDN) - network first with cache fallback
            urlPattern: /^https?:\/\/(www\.gravatar\.com|cdnjs\.cloudflare\.com)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'external-resources',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        // Clean up old caches
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true, // Enable PWA in development for testing
        type: 'module',
      },
    }),
    sri({
      algorithms: ['sha384', 'sha512'],
    }),
    {
      name: 'security-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' http://localhost:5000 ws: wss:; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self'; " +
            "manifest-src 'self';"
          );

          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-XSS-Protection', '1; mode=block');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
})
