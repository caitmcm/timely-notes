/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API's origin when it is deployed apart from the UI; unset in dev, where the proxy serves it. */
  readonly VITE_API_BASE_URL?: string
  /** `oidc` (the default) or `static`, which only an E2E build may use. */
  readonly VITE_AUTH_MODE?: 'oidc' | 'static'
  /** The bearer token `static` mode sends. */
  readonly VITE_AUTH_STATIC_TOKEN?: string
  readonly VITE_AUTH_AUTHORITY: string
  readonly VITE_AUTH_CLIENT_ID: string
  readonly VITE_AUTH_AUDIENCE: string
  /** Named in the sign-in notice, so a provider change cannot leave the wording wrong. */
  readonly VITE_AUTH_PROVIDER_NAME: string
}
