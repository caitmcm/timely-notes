import { useMemo, type ReactNode } from 'react'
import { AuthContext, type Auth } from './useAuth'

const nothing = async () => {}

/** The E2E lanes' auth: always signed in with one fixed token, and never redirects. */
export function StaticAuthProvider({ token, children }: { token: string; children: ReactNode }) {
  const auth = useMemo<Auth>(
    () => ({
      status: 'signedIn',
      email: 'e2e@timely-notes.test',
      tokens: { token: async () => token, renew: async () => token },
      signIn: nothing,
      signUp: nothing,
      signOut: nothing,
    }),
    [token],
  )

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
