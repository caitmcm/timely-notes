import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The UI calls same-origin `/api/...`; the proxy forwards to the backend so no CORS config
    // is needed. Dev-only — a production base URL is deferred.
    proxy: {
      '/api': 'http://localhost:5186',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
