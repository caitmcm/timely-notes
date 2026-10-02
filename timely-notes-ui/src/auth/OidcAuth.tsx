import { useMemo, type ReactNode } from 'react'
import { AuthProvider, useAuth as useOidc } from 'react-oidc-context'
import type { UserManager } from 'oidc-client-ts'
import { AuthContext, type Auth, type TokenSource } from './useAuth'

interface Props {
  userManager: UserManager
  audience: string
  children: ReactNode
}

/** Drops `code` and `state` from the address bar once the callback is processed. */
function clearCallbackParams() {
  window.history.replaceState({}, document.title, window.location.pathname)
}

export function OidcAuthProvider({ userManager, audience, children }: Props) {
  return (
    <AuthProvider userManager={userManager} onSigninCallback={clearCallbackParams}>
      <OidcBridge userManager={userManager} audience={audience}>
        {children}
      </OidcBridge>
    </AuthProvider>
  )
}

function OidcBridge({ userManager, audience, children }: Props) {
  const oidc = useOidc()

  // Read from the manager, not from render state, so a held TokenSource never goes stale.
  const tokens = useMemo<TokenSource>(() => {
    const renew = async () => {
      const user = await userManager.signinSilent()

      if (!user) {
        throw new Error('Silent renewal returned no session.')
      }

      return user.access_token
    }

    return {
      renew,
      token: async () => {
        const user = await userManager.getUser()

        return user && !user.expired ? user.access_token : renew()
      },
    }
  }, [userManager])

  const status = oidc.isLoading ? 'loading' : oidc.isAuthenticated ? 'signedIn' : 'signedOut'
  const email = oidc.user?.profile.email ?? null

  const auth = useMemo<Auth>(
    () => ({
      status,
      email,
      tokens,
      signIn: () => userManager.signinRedirect({ extraQueryParams: { audience } }),
      signUp: () =>
        userManager.signinRedirect({ extraQueryParams: { audience, screen_hint: 'signup' } }),
      signOut: () =>
        userManager.signoutRedirect({
          post_logout_redirect_uri: userManager.settings.post_logout_redirect_uri,
        }),
    }),
    [status, email, tokens, userManager, audience],
  )

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
