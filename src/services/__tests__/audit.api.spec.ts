import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({ http: { get: (...a: unknown[]) => get(...a) } }))

import * as api from '../audit.api'

beforeEach(() => {
  get.mockReset()
})

describe('audit api layer', () => {
  it('sends only limit/offset when no filters are set', async () => {
    get.mockResolvedValue({ data: [] })
    await api.listLogs({ limit: 50, offset: 0 })
    expect(get).toHaveBeenCalledWith('/audit/logs', { params: { limit: 50, offset: 0 } })
  })

  it('includes set filters and omits empty ones', async () => {
    get.mockResolvedValue({ data: [] })
    await api.listLogs({ limit: 50, offset: 50, action: 'login', entity_type: '', actor_id: 'a1' })
    expect(get).toHaveBeenLastCalledWith('/audit/logs', {
      params: { limit: 50, offset: 50, action: 'login', actor_id: 'a1' },
    })
  })

  it('gets a single entry by id', async () => {
    get.mockResolvedValue({ data: { id: 'e1', action: 'login.success' } })
    const entry = await api.getLog('e1')
    expect(get).toHaveBeenCalledWith('/audit/logs/e1')
    expect(entry.action).toBe('login.success')
  })
})
