import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Optional local HTTPS for testing on a real device. A service worker and Web Crypto only exist in
// a secure context, so a phone loading the dev server over the network needs https; without the
// certificate files the server stays on http, which is fine for localhost. See
// docs/local-development.md for how to generate them. The certificates are git-ignored.
const certDir = fileURLToPath(new URL('../../.certs/', import.meta.url));
const httpsOptions = ((): { key: Buffer; cert: Buffer } | undefined => {
  const key = `${certDir}dev-key.pem`;
  const cert = `${certDir}dev-cert.pem`;
  return existsSync(key) && existsSync(cert)
    ? { key: readFileSync(key), cert: readFileSync(cert) }
    : undefined;
})();

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
    ...(httpsOptions ? { https: httpsOptions } : {}),
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true } },
  },
  // `vite preview` serves the built app the same way, so an alpha build can be run and tested
  // without deploying a separate static host in front of the public API.
  preview: {
    port: 4173,
    ...(httpsOptions ? { https: httpsOptions } : {}),
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true } },
  },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
