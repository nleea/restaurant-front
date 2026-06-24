import { defineStore } from 'pinia'
import { http } from '@/lib/http'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '@/lib/tokens'

export interface User {
  id: string
  email: string
  name: string
  permissions: string[]
}

interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  permissions: string[]
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    // Seed from storage so a reload starts "authenticated" until bootstrap() confirms.
    accessToken: getAccessToken(),
    refreshToken: getRefreshToken(),
    user: null,
    permissions: [],
  }),

  getters: {
    isAuthenticated: (state): boolean => Boolean(state.accessToken || state.refreshToken),
    // Parameterized getter: permissions come only from /auth/me, never the JWT.
    can: (state) => (code: string): boolean => state.permissions.includes(code),
  },

  actions: {
    async login(email: string, password: string): Promise<void> {
      const { data } = await http.post<TokenPair>('/auth/login', { email, password })
      setTokens(data.access_token, data.refresh_token)
      this.accessToken = data.access_token
      this.refreshToken = data.refresh_token
      await this.fetchMe()
    },

    async fetchMe(): Promise<void> {
      const { data } = await http.get<User>('/auth/me')
      this.user = data
      this.permissions = data.permissions ?? []
    },

    // Rehydrate identity from a stored token after a page reload (the F5 race): the token is
    // in storage but the store has no user yet. Called by the router guard before deciding.
    async bootstrap(): Promise<void> {
      if (this.user) return
      if (!getAccessToken() && !getRefreshToken()) return
      try {
        await this.fetchMe()
      } catch {
        this.logout()
      }
    },

    logout(): void {
      clearTokens()
      this.accessToken = null
      this.refreshToken = null
      this.user = null
      this.permissions = []
    },
  },
})
