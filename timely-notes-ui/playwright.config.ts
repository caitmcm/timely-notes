import { defineConfig, devices } from '@playwright/test'
import { mintApiToken } from './e2e/fixtures/mintToken'

/**
 * The stubbed lane runs on 5174 so it never collides with a developer's own 5173 dev server; the
 * integrated lane has to use the defaults, because `vite.config.ts` hardcodes the proxy target.
 */
const STUBBED_URL = 'http://127.0.0.1:5174'
const INTEGRATED_URL = 'http://localhost:5173'

// `webServer` is config-wide, not per project, so which servers to start is read off the requested
// project. An env var would not survive `npm run` on Windows; the stubbed lane never needs the SDK.
const isIntegrated = process.argv.includes('integrated') || process.argv.includes('--project=integrated')

// Minted here, not in globalSetup: `webServer` starts first, and the dev server bakes the token in.
const integratedToken = isIntegrated ? mintApiToken() : ''

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Two, not one per core: every worker loads the editor bundle cold, and a wider fan-out starves
  // the preview server — ten workers took 2m and timed out, two take 9s.
  workers: process.env.CI ? 1 : 2,
  // Never the HTML reporter by default: `show-report` starts a server and strands an agent.
  reporter: [['list']],
  use: {
    timezoneId: 'Europe/London',
    locale: 'en-GB',
    trace: 'on-first-retry',
    screenshot: 'on-first-failure',
  },
  projects: [
    {
      name: 'stubbed',
      grepInvert: /@integrated/,
      use: { ...devices['Desktop Chrome'], baseURL: STUBBED_URL },
    },
    {
      name: 'integrated',
      grep: /@integrated/,
      // One worker's worth: two cold loads at once against a fresh dev server sometimes never
      // reach `load`, and the lane is one file of five tests anyway.
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], baseURL: INTEGRATED_URL },
    },
  ],
  webServer: isIntegrated
    ? [
        {
          command: 'dotnet run --project TimelyNotes.API --launch-profile http',
          cwd: '../TimelyNotes.Backend',
          // The notes routes need query parameters, so Swagger is the only bare-GET readiness URL.
          url: 'http://localhost:5186/swagger/index.html',
          reuseExistingServer: true,
          timeout: 180_000,
        },
        {
          // `e2e` mode: static auth, signed in as the minted token's user. Never a running dev
          // server, which would be in `oidc` mode and show the sign-in screen.
          command: 'npm run dev -- --mode e2e --port 5173 --strictPort',
          url: INTEGRATED_URL,
          env: { VITE_AUTH_STATIC_TOKEN: integratedToken },
          reuseExistingServer: false,
        },
      ]
    : [
        {
          // The built bundle, not the dev server: a fresh browser context has an empty cache, and
          // re-transforming the editor's module graph per test made a cold load take twenty seconds.
          // Nothing here needs the dev proxy — every /api request is intercepted.
          command:
            'npm run build -- --mode e2e && npm run preview -- --host 127.0.0.1 --port 5174 --strictPort',
          url: STUBBED_URL,
          reuseExistingServer: !process.env.CI,
        },
      ],
})
