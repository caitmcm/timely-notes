import { useEffect } from 'react'
import { act, render, screen } from '@testing-library/react'
import { User, type UserManager } from 'oidc-client-ts'
import { OidcAuthProvider } from './OidcAuth'
import { createUserManager } from './oidc'
import { useAuth } from './useAuth'

const AUTHORITY = 'https://tenant.example/'
const CLIENT_ID = 'client-123'
const AUDIENCE = 'https://api.example'

let seen: ReturnType<typeof useAuth> | null = null

function Probe() {
  const auth = useAuth()

  useEffect(() => {
    seen = auth
  })

  return (
    <p>
      {auth.status} {auth.email ?? 'no-email'}
    </p>
  )
}

function userManager(): UserManager {
  return createUserManager({
    authority: AUTHORITY,
    clientId: CLIENT_ID,
    audience: AUDIENCE,
    origin: 'http://localhost:5173',
  })
}

function storedUser(accessToken: string, email: string): User {
  return new User({
    access_token: accessToken,
    token_type: 'Bearer',
    profile: { sub: 'auth0|alice', iss: AUTHORITY, aud: CLIENT_ID, exp: 0, iat: 0, email },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })
}

async function renderWith(manager: UserManager) {
  render(
    <OidcAuthProvider userManager={manager} audience={AUDIENCE}>
      <Probe />
    </OidcAuthProvider>,
  )

  await screen.findByText(/^(signedOut|signedIn)/)
}

describe('OidcAuthProvider', () => {
  beforeEach(() => {
    seen = null
    sessionStorage.clear()
  })

  it('starts signed out when nothing is stored', async () => {
    await renderWith(userManager())

    expect(screen.getByText('signedOut no-email')).toBeInTheDocument()
  })

  it('is signed in, with the email address, when a session is stored', async () => {
    const manager = userManager()
    await manager.storeUser(storedUser('stored-token', 'alice@example.com'))

    await renderWith(manager)

    expect(screen.getByText('signedIn alice@example.com')).toBeInTheDocument()
    await expect(seen!.tokens.token()).resolves.toBe('stored-token')
  })

  it('signIn redirects with the audience on the authorize request', async () => {
    const manager = userManager()
    const redirect = vi.spyOn(manager, 'signinRedirect').mockResolvedValue()
    await renderWith(manager)

    await act(() => seen!.signIn())

    expect(redirect).toHaveBeenCalledWith({ extraQueryParams: { audience: AUDIENCE } })
  })

  it('signUp is the same redirect, opening on the sign-up form', async () => {
    const manager = userManager()
    const redirect = vi.spyOn(manager, 'signinRedirect').mockResolvedValue()
    await renderWith(manager)

    await act(() => seen!.signUp())

    expect(redirect).toHaveBeenCalledWith({
      extraQueryParams: { audience: AUDIENCE, screen_hint: 'signup' },
    })
  })

  it('renew forces a silent renew and returns the new access token', async () => {
    const manager = userManager()
    await manager.storeUser(storedUser('old-token', 'alice@example.com'))
    const silent = vi
      .spyOn(manager, 'signinSilent')
      .mockResolvedValue(storedUser('new-token', 'alice@example.com'))
    await renderWith(manager)

    await expect(seen!.tokens.renew()).resolves.toBe('new-token')
    expect(silent).toHaveBeenCalledTimes(1)
  })

  it('a renewal that yields no user rejects', async () => {
    const manager = userManager()
    vi.spyOn(manager, 'signinSilent').mockResolvedValue(null)
    await renderWith(manager)

    await expect(seen!.tokens.renew()).rejects.toThrow()
  })

  it('signOut is RP-initiated, returning to the app origin', async () => {
    const manager = userManager()
    await manager.storeUser(storedUser('stored-token', 'alice@example.com'))
    const signout = vi.spyOn(manager, 'signoutRedirect').mockResolvedValue()
    await renderWith(manager)

    await act(() => seen!.signOut())

    expect(signout).toHaveBeenCalledWith({ post_logout_redirect_uri: 'http://localhost:5173' })
  })
})

describe('createUserManager', () => {
  it('asks for the scopes the app uses, and no profile', () => {
    expect(userManager().settings.scope).toBe('openid email offline_access')
  })

  it('keeps the session in sessionStorage', async () => {
    const manager = userManager()

    await manager.storeUser(storedUser('stored-token', 'alice@example.com'))

    expect(Object.keys(sessionStorage).some((key) => key.includes(CLIENT_ID))).toBe(true)
  })

  it('returns to the app origin after sign-in', () => {
    expect(userManager().settings.redirect_uri).toBe('http://localhost:5173')
  })
})
