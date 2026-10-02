/** Run by `vite.config.ts` at build time, so no DOM and no React. */
const OIDC_SETTINGS = [
  'VITE_AUTH_AUTHORITY',
  'VITE_AUTH_CLIENT_ID',
  'VITE_AUTH_AUDIENCE',
  'VITE_AUTH_PROVIDER_NAME',
] as const

export function assertDeployableAuthMode(
  mode: string,
  env: Record<string, string | undefined>,
): void {
  if (mode !== 'production') {
    return
  }

  if (env.VITE_AUTH_MODE === 'static') {
    throw new Error(
      'VITE_AUTH_MODE=static signs every visitor in with a fixed token. '
        + 'It is for the E2E lanes (--mode e2e), never a production build.',
    )
  }

  const missing = OIDC_SETTINGS.filter((key) => !env[key]?.trim())

  if (missing.length > 0) {
    throw new Error(`A production build needs ${missing.join(', ')}; each was empty or unset.`)
  }
}
