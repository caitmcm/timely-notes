/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API's origin when it is deployed apart from the UI; unset in dev, where the proxy serves it. */
  readonly VITE_API_BASE_URL?: string
}
