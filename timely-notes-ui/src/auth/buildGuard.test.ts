import { assertDeployableAuthMode } from './buildGuard'

const OIDC = {
  VITE_AUTH_AUTHORITY: 'https://tenant.example/',
  VITE_AUTH_CLIENT_ID: 'client-123',
  VITE_AUTH_AUDIENCE: 'https://api.example',
  VITE_AUTH_PROVIDER_NAME: 'Provider Co',
}

describe('assertDeployableAuthMode', () => {
  it('rejects static auth in a production build', () => {
    expect(() =>
      assertDeployableAuthMode('production', { ...OIDC, VITE_AUTH_MODE: 'static' }),
    ).toThrow(/VITE_AUTH_MODE/)
  })

  it.each([
    ['production', undefined],
    ['production', 'oidc'],
    ['e2e', 'static'],
    ['development', 'static'],
  ])('allows mode %s with auth mode %s', (mode, authMode) => {
    expect(() =>
      assertDeployableAuthMode(mode, { ...OIDC, VITE_AUTH_MODE: authMode }),
    ).not.toThrow()
  })

  // A CI variable left unset arrives as an empty string and overrides the checked-in `.env`.
  it.each(Object.keys(OIDC))('rejects a production OIDC build with %s empty', (key) => {
    expect(() => assertDeployableAuthMode('production', { ...OIDC, [key]: '' })).toThrow(key)
  })

  it('does not ask a static build for OIDC settings', () => {
    expect(() =>
      assertDeployableAuthMode('e2e', { VITE_AUTH_MODE: 'static' }),
    ).not.toThrow()
  })
})
