import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const post = vi.fn<(...a: unknown[]) => unknown>()
const get = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({ http: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) } }))

const setTokens = vi.fn<(...a: unknown[]) => void>()
const clearTokens = vi.fn<() => void>()
vi.mock('@/lib/tokens', () => ({
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setTokens: (...a: unknown[]) => setTokens(...a),
  clearTokens: () => clearTokens(),
}))

import { useAuthStore } from '../auth'

beforeEach(() => {
  setActivePinia(createPinia())
  post.mockReset()
  get.mockReset()
  setTokens.mockClear()
  clearTokens.mockClear()
})

describe('auth store', () => {
  it('login stores tokens and resolves identity via /auth/me', async () => {
    post.mockResolvedValue({
      data: { access_token: 'a', refresh_token: 'r', token_type: 'bearer' },
    })
    get.mockResolvedValue({
      data: { id: '1', email: 'admin@demo.com', name: 'Admin', permissions: ['rbac.manage'] },
    })

    const auth = useAuthStore()
    await auth.login('admin@demo.com', 'admin1234')

    expect(setTokens).toHaveBeenCalledWith('a', 'r')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.email).toBe('admin@demo.com')
  })

  it('can() reflects only the permissions from /auth/me', async () => {
    get.mockResolvedValue({
      data: { id: '1', email: 'x@y.z', name: 'X', permissions: ['rbac.manage', 'menu.read'] },
    })

    const auth = useAuthStore()
    await auth.fetchMe()

    expect(auth.can('rbac.manage')).toBe(true)
    expect(auth.can('menu.read')).toBe(true)
    expect(auth.can('finance.manage')).toBe(false)
  })

  it('logout clears identity and tokens', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'x@y.z', name: 'X', permissions: ['a'] }
    auth.accessToken = 'a'
    auth.logout()

    expect(clearTokens).toHaveBeenCalled()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})
