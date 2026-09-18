import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokens'

// --- baseURL: same origin, under /api ----------------------------------------------------
// The API is served from the SAME host as the app, under `/api` (dev: Vite proxies it to
// :8000; deployed: the tunnel routes `/api/*` to the backend). That is not a deployment
// detail — the backend resolves the tenant from the Host subdomain, so the app and its API
// MUST share a hostname, and sharing one without a prefix is impossible: fourteen SPA routes
// (`/menu`, `/orders`, `/inventory`, …) are named exactly like fourteen API prefixes.
//
// Being relative is what makes it multi-tenant for free: at demo.wsquote.uk the requests go
// to demo.wsquote.uk, at otro.wsquote.uk they go to otro.wsquote.uk. An absolute URL would
// be a single host for every tenant — i.e. one business's customers hitting another's data.
// There is no tenant_id in any request body.
//
// VITE_API_BASE_URL still overrides, for the case where the API genuinely lives elsewhere.
// It is an escape hatch, not the normal path: set it and you own the tenant problem above.
function resolveBaseURL(): string {
  // Prioridad: runtime (env.js del pod) -> build-time (VITE_*) -> mismo origen.
  const runtime = window.__ENV__ ?? {}
  const override = runtime.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL
  if (override) return override
  return '/api'
}

export const baseURL = resolveBaseURL()

// The main instance: every app/service call goes through here.
export const http = axios.create({ baseURL })

// A bare instance with NO interceptors, used only for the refresh call so it can never
// recurse back into the 401 handler below. Exported so tests can stub its adapter.
export const rawHttp = axios.create({ baseURL })

interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

// --- request interceptor: attach the bearer token ----------------------------------------
http.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- response interceptor: single-flight transparent refresh on 401 ----------------------
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

// Shared in-flight refresh promise. The first 401 sets it; concurrent 401s await the SAME
// promise instead of each firing their own refresh (which would race-rotate the token).
let refreshing: Promise<string> | null = null

async function runRefresh(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('No refresh token available')
  }
  const { data } = await rawHttp.post<TokenPair>('/auth/refresh', {
    refresh_token: refreshToken,
  })
  setTokens(data.access_token, data.refresh_token)
  return data.access_token
}

// Forced logout uses a hard navigation rather than importing the router, which would create
// an http -> router -> store -> http cycle. A full reload on logout also clears app state.
function forceLogout(): void {
  clearTokens()
  const here = window.location.pathname + window.location.search
  if(window.location.pathname === '/login') {
    return
  }
  const redirect = encodeURIComponent(here)
  window.location.assign(`/login?redirect=${redirect}`)
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status

    // Not a 401, no config, or already retried once -> give up. If an already-retried
    // request still 401s, the session is unrecoverable: log out.
    if (status !== 401 || !original || original._retry) {
      if (status === 401 && original?._retry) {
        forceLogout()
      }
      return Promise.reject(error)
    }

    original._retry = true
    try {
      refreshing ??= runRefresh().finally(() => {
        refreshing = null
      })
      const newToken = await refreshing
      original.headers.Authorization = `Bearer ${newToken}`
      return http(original)
    } catch (refreshError) {
      forceLogout()
      return Promise.reject(refreshError)
    }
  },
)
