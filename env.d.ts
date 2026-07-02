/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full API base URL override (e.g. https://api.example.com). When unset, the base URL is
   *  derived from the browser Host so the tenant subdomain rides along. */
  readonly VITE_API_BASE_URL?: string
  /** API port used when deriving the base URL from the Host. Defaults to 8000. */
  readonly VITE_API_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
