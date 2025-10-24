import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import sri from 'vite-plugin-sri'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Subresource Integrity plugin for production builds
    sri({
      algorithms: ['sha384', 'sha512'],
    }),
    // Security headers plugin
    {
      name: 'security-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Content Security Policy
          res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " + // Note: eval needed for dev mode
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' http://localhost:5000 ws: wss:; " + // Allow backend API in dev
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self';"
          );

          // Other security headers
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
    // Enable source maps for production debugging
    sourcemap: true,
    // Security: minimize bundle size
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
      },
    },
  },
})
