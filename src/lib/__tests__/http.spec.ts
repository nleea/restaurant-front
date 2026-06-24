import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'

// In-memory token store so the interceptor has a refresh token to use.
let access = 'expired-token'
let refresh: string | null = 'refresh-token'
const setTokens = vi.fn<(a: string, r: string) => void>((a, r) => {
  access = a
  refresh = r
})
const clearTokens = vi.fn<() => void>(() => {
  access = ''
  refresh = null
})

vi.mock('../tokens', () => ({
  getAccessToken: () => access,
  getRefreshToken: () => refresh,
  setTokens: (a: string, r: string) => setTokens(a, r),
  clearTokens: () => clearTokens(),
}))

import { http, rawHttp } from '../http'

function unauthorized(config: InternalAxiosRequestConfig): Promise<never> {
  return Promise.reject(
    new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
      data: {},
    }),
  )
}

beforeEach(() => {
  access = 'expired-token'
  refresh = 'refresh-token'
  setTokens.mockClear()
  clearTokens.mockClear()
  // Avoid jsdom navigation on forced logout.
  Object.defineProperty(window, 'location', {
    value: { pathname: '/x', search: '', assign: vi.fn<() => void>() },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('transparent refresh on 401', () => {
  it('coalesces concurrent 401s into exactly one refresh and replays all requests', async () => {
    let refreshCalls = 0
    // rawHttp serves /auth/refresh, counting how many times it is hit.
    rawHttp.defaults.adapter = (async (config) => {
      refreshCalls += 1
      return {
        data: { access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'bearer' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }) as AxiosAdapter

    // http: 401 unless the request already carries the refreshed token.
    http.defaults.adapter = (async (config) => {
      if (config.headers.Authorization === 'Bearer new-access') {
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
      }
      return unauthorized(config)
    }) as AxiosAdapter

    const results = await Promise.all([
      http.get('/a'),
      http.get('/b'),
      http.get('/c'),
    ])

    expect(refreshCalls).toBe(1)
    expect(setTokens).toHaveBeenCalledTimes(1)
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
  })

  it('does not loop: a request still 401 after refresh logs out and rejects', async () => {
    rawHttp.defaults.adapter = (async (config) => ({
      data: { access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'bearer' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })) as AxiosAdapter

    // Always 401, even with the new token -> unrecoverable.
    http.defaults.adapter = ((config) => unauthorized(config)) as AxiosAdapter

    await expect(http.get('/always-401')).rejects.toBeInstanceOf(AxiosError)
    expect(clearTokens).toHaveBeenCalled()
  })
})
