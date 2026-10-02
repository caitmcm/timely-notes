import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthGate from './AuthGate'
import { AuthContext, type Auth, type AuthStatus } from './auth/useAuth'

vi.mock('./components/NoteEditor', () => ({ default: () => null }))

function fakeAuth(status: AuthStatus): Auth {
  return {
    status,
    email: status === 'signedIn' ? 'alice@example.com' : null,
    tokens: { token: async () => 'gate-token', renew: async () => 'gate-token' },
    signIn: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }
}

function renderGate(auth: Auth) {
  render(
    <AuthContext.Provider value={auth}>
      <AuthGate />
    </AuthContext.Provider>,
  )
}

describe('AuthGate', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_AUTH_PROVIDER_NAME', 'Provider Co')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('signed out', () => {
    it('shows the sign-in screen and calls no API', async () => {
      renderGate(fakeAuth('signedOut'))

      expect(screen.getByRole('heading', { name: 'Timely Notes' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Note now' })).not.toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Sign in calls signIn', async () => {
      const auth = fakeAuth('signedOut')
      renderGate(auth)

      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(auth.signIn).toHaveBeenCalledTimes(1)
      expect(auth.signUp).not.toHaveBeenCalled()
    })

    it('Create account calls signUp', async () => {
      const auth = fakeAuth('signedOut')
      renderGate(auth)

      await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

      expect(auth.signUp).toHaveBeenCalledTimes(1)
      expect(auth.signIn).not.toHaveBeenCalled()
    })

    it('says what the app keeps, and names the provider that holds the email address', () => {
      renderGate(fakeAuth('signedOut'))

      expect(
        screen.getByText(
          /keeps your notes and an anonymous account ID, never your name or email address/,
        ),
      ).toBeInTheDocument()
      expect(screen.getByText(/Signing in is handled by Provider Co/)).toBeInTheDocument()
    })
  })

  it('shows neither screen while the session is still being read', () => {
    renderGate(fakeAuth('loading'))

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Note now' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the app when signed in, fetching with the session’s token', async () => {
    renderGate(fakeAuth('signedIn'))

    expect(await screen.findByRole('button', { name: 'Note now' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe(
      'Bearer gate-token',
    )
  })
})
