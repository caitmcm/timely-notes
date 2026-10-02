import { useState, type ReactNode } from 'react'
import { OidcAuthProvider } from './OidcAuth'
import { StaticAuthProvider } from './StaticAuth'
import { createUserManager } from './oidc'

/** Picks the auth implementation at build time; `static` exists only for the E2E lanes. */
export function AuthBoundary({ children }: { children: ReactNode }) {
  if (import.meta.env.VITE_AUTH_MODE === 'static') {
    return (
      <StaticAuthProvider token={import.meta.env.VITE_AUTH_STATIC_TOKEN ?? ''}>
        {children}
      </StaticAuthProvider>
    )
  }

  return <OidcBoundary>{children}</OidcBoundary>
}

function OidcBoundary({ children }: { children: ReactNode }) {
  const audience = import.meta.env.VITE_AUTH_AUDIENCE

  // One manager for the app's life: it owns the session and the silent-renew timer.
  const [userManager] = useState(() =>
    createUserManager({
      authority: import.meta.env.VITE_AUTH_AUTHORITY,
      clientId: import.meta.env.VITE_AUTH_CLIENT_ID,
      audience,
      origin: window.location.origin,
    }),
  )

  return (
    <OidcAuthProvider userManager={userManager} audience={audience}>
      {children}
    </OidcAuthProvider>
  )
}
