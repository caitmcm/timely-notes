import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { assertDeployableAuthMode } from './src/auth/buildGuard.ts'

/** Fails a production build that is static, or OIDC with a setting missing. */
function authModeGuard(): Plugin {
  return {
    name: 'auth-mode-guard',
    apply: 'build',
    config(_, { mode }) {
      assertDeployableAuthMode(mode, loadEnv(mode, process.cwd(), 'VITE_'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), authModeGuard()],
  server: {
    // The UI calls same-origin `/api/...`; the proxy forwards to the backend so no CORS config
    // is needed. Dev-only: in a deployment `VITE_API_BASE_URL` names the API origin instead.
    proxy: {
      '/api': 'http://localhost:5186',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Vitest owns `src/`; `e2e/` is Playwright's, and its `test()` refuses to run under any other
    // runner. Unit tests sit beside the code they cover, so nothing of ours lives outside `src/`.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
