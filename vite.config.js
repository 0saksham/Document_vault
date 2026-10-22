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
            urlPattern: /\/vault\/.*\.enc$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'vault-encrypted',
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
