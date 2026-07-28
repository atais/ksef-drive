import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  base: '/ksef-gdrive/',
  plugins: [svelte()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api/ksef': {
        target: 'https://api.ksef.mf.gov.pl/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ksef/, ''),
        secure: false,
      },
    },
  },
})
