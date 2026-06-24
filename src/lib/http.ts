import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokens'

// --- baseURL: derived from the browser Host so the tenant subdomain rides along ----------
// Dev: app runs at demo.localhost:5173 -> API at demo.localhost:8000 (tenant = "demo").
// There is no tenant_id in any request body. An explicit VITE_API_BASE_URL overrides this.
function resolveBaseURL(): string {
  const override = import.meta.env.VITE_API_BASE_URL
  if (override) return override
  const { protocol, hostname } = window.location
  const port = import.meta.env.VITE_API_PORT ?? '8000'
  return `${protocol}//${hostname}:${port}`
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
