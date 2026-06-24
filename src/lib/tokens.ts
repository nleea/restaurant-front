// Token storage leaf. Imported by both the Axios instance and the auth store; it imports
// NEITHER of them, which is what breaks the axios <-> store circular dependency.

const ACCESS_KEY = 'auth.access_token'
const REFRESH_KEY = 'auth.refresh_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}
