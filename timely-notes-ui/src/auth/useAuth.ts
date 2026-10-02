import { createContext, useContext } from 'react'

/** Where an API call gets its bearer token. `renew` forces a fresh one, for a retry after `401`. */
export interface TokenSource {
  token(): Promise<string>
  renew(): Promise<string>
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface Auth {
  status: AuthStatus
  /** From the ID token, for *Signed in as*; never sent to the API. */
  email: string | null
  tokens: TokenSource
  signIn(): Promise<void>
  signUp(): Promise<void>
  signOut(): Promise<void>
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)

  if (!auth) {
    throw new Error('useAuth must be used inside AuthBoundary.')
  }

  return auth
}
