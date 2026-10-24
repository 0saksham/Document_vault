import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: false, // we use our own manifest.webmanifest
      workbox: {
        // Only cache app shell, never decrypted data
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        runtimeCaching: [
          {
            // Manifest holds the vault index; always check network first so updates appear immediately
            urlPattern: /\/vault\/manifest\.enc(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vault-manifest',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            // Document ciphertexts are content-addressed by UUID; CacheFirst enables offline viewing
            urlPattern: /\/vault\/[a-f0-9-]+\.enc$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'vault-documents',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ],
        navigateFallback: 'index.html'
      }
    })
  ],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          pdfjs: ['pdfjs-dist']
        }
      }
    }
  }
})
