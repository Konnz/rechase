import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 're:chase',
        short_name: 're:chase',
        description: 'Bestzeiten auf bekannten Strecken live als Ghost jagen.',
        lang: 'de',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0D0F12',
        theme_color: '#0D0F12',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/healthz/, /^\/api\//],
        // Gesehene Kartenkacheln bleiben im Cache, damit die Karte im Funkloch weitergeht.
        runtimeCaching: [
          {
            // Stil und TileJSON zeigen auf den neuesten Datenstand: aus dem Cache, im Hintergrund auffrischen
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(styles\/|planet$)/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-style' },
          },
          {
            // Kacheln, Schriften, Symbole: die URLs enthalten den Datenstand und ändern sich nicht
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: '../../build/public',
    emptyOutDir: true,
  },
});
