import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The app shell is precached by the service worker. Bani bundles are NOT cached by the service
// worker: they are verified and stored in IndexedDB by the app, so a corrupted cache can never be
// rendered as Gurbani (RISK_REGISTER R-23). No third-party origin is ever contacted.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Pothi Sahib',
        short_name: 'Pothi Sahib',
        description:
          'Privacy-first, offline-first Gurbani reader backed by the human-verified Gurbani Kosh corpus.',
        lang: 'pa',
        display: 'standalone',
        background_color: '#f7f3ea',
        theme_color: '#3b3a36',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
        // API responses are never served from the SW cache
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true } },
  },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
