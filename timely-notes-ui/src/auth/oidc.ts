import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export interface OidcConfig {
  authority: string
  clientId: string
  audience: string
  /** Where the provider returns to after sign-in and sign-out. */
  origin: string
}

/** Authorization Code + PKCE, refresh tokens, session in `sessionStorage`. */
export function createUserManager({ authority, clientId, audience, origin }: OidcConfig): UserManager {
  return new UserManager({
    authority,
    client_id: clientId,
    redirect_uri: origin,
    post_logout_redirect_uri: origin,
    scope: 'openid email offline_access',
    // Without it Auth0 issues an opaque access token, and every API call is a 401.
    extraQueryParams: { audience },
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  })
}
