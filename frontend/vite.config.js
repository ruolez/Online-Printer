import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Printer Online',
        short_name: 'PrinterApp',
        description: 'Automatic PDF Printing Application',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,pdf}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/health/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'health-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^\/api\/stations.*\/heartbeat/,
            handler: 'NetworkOnly',
            method: 'PUT',
            options: {
              backgroundSync: {
                name: 'heartbeat-queue',
                options: {
                  maxRetentionTime: 24 * 60 // Retry for 24 hours
                }
              },
              plugins: [{
                handlerDidError: async () => {
                  // Return a custom offline response
                  return new Response(
                    JSON.stringify({ status: 'queued', message: 'Heartbeat queued for sync' }),
                    { headers: { 'Content-Type': 'application/json' } }
                  );
                }
              }]
            }
          },
          {
            urlPattern: /^\/api\/print-queue/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'print-queue-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 300
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              plugins: [{
                handlerDidError: async () => {
                  // Return cached data if available when offline
                  const cache = await caches.open('print-queue-cache');
                  const cachedResponse = await cache.match('/api/print-queue');
                  return cachedResponse || new Response(
                    JSON.stringify({ print_jobs: [], message: 'Offline - showing cached data' }),
                    { headers: { 'Content-Type': 'application/json' } }
                  );
                }
              }]
            }
          },
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 600
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.pdf$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 1 week
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              plugins: [{
                cacheWillUpdate: async ({ response }) => {
                  // Only cache PDFs that are fully downloaded
                  if (response && response.ok) {
                    return response;
                  }
                  return null;
                }
              }]
            }
          }
        ],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://backend:5000',
        changeOrigin: true,
      }
    }
  }
})
