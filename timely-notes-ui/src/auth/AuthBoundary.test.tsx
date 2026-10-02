import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { AuthBoundary } from './AuthBoundary'
import { useAuth } from './useAuth'

let seen: ReturnType<typeof useAuth> | null = null

function Probe() {
  const auth = useAuth()

  useEffect(() => {
    seen = auth
  })

  return <p>{auth.status}</p>
}

describe('AuthBoundary', () => {
  beforeEach(() => {
    seen = null
    sessionStorage.clear()
    vi.stubEnv('VITE_AUTH_AUTHORITY', 'https://tenant.example/')
    vi.stubEnv('VITE_AUTH_CLIENT_ID', 'client-123')
    vi.stubEnv('VITE_AUTH_AUDIENCE', 'https://api.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is static, signed in with the configured token, when VITE_AUTH_MODE is static', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'static')
    vi.stubEnv('VITE_AUTH_STATIC_TOKEN', 'e2e-token')

    render(
      <AuthBoundary>
        <Probe />
      </AuthBoundary>,
    )

    expect(screen.getByText('signedIn')).toBeInTheDocument()
    await expect(seen!.tokens.token()).resolves.toBe('e2e-token')
  })

  it('is OIDC by default', async () => {
    vi.stubEnv('VITE_AUTH_MODE', undefined)

    render(
      <AuthBoundary>
        <Probe />
      </AuthBoundary>,
    )

    expect(await screen.findByText('signedOut')).toBeInTheDocument()
  })
})
