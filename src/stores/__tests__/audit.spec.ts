import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listLogs: vi.fn<(...a: unknown[]) => unknown>(),
  getLog: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/audit.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

const rbacMock = vi.hoisted(() => ({ listUsers: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/rbac.api', () => rbacMock)

const authMock = vi.hoisted(() => ({ can: vi.fn<(...a: unknown[]) => boolean>() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authMock }))

import { useAuditStore } from '../audit'

const entry = (id: string, action = 'login.success', actor: string | null = 'u1') => ({
  id,
  action,
  actor_id: actor,
  branch_id: null,
  entity_type: 'user',
  entity_id: null,
  ip: '1.2.3.4',
  detail: null,
  created_at: '2026-06-25T12:00:00Z',
})
// A full page of `n` entries (pageSize 50).
const page = (n: number) => Array.from({ length: n }, (_, i) => entry(`e${i}`))

beforeEach(() => {
  setActivePinia(createPinia())
  apiMock.listLogs.mockReset()
  rbacMock.listUsers.mockReset()
  authMock.can.mockReset()
})

describe('audit store', () => {
  it('query loads the first page and resets offset', async () => {
    apiMock.listLogs.mockResolvedValue([entry('e1'), entry('e2')])
    const a = useAuditStore()
    await a.query({ action: 'login' })
    expect(apiMock.listLogs).toHaveBeenCalledWith({
      action: 'login',
      actor_id: null,
      entity_type: null,
      branch_id: null,
      limit: 50,
      offset: 0,
    })
    expect(a.entries).toHaveLength(2)
    expect(a.offset).toBe(2)
    expect(a.reachedEnd).toBe(true) // short page
  })

  it('load-more appends the next page and advances the offset', async () => {
    apiMock.listLogs.mockResolvedValueOnce(page(50)) // full first page
    const a = useAuditStore()
    await a.query()
    expect(a.reachedEnd).toBe(false)
    expect(a.offset).toBe(50)
    apiMock.listLogs.mockResolvedValueOnce([entry('x1'), entry('x2')]) // short next page
    await a.loadMore()
    expect(apiMock.listLogs).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }))
    expect(a.entries).toHaveLength(52)
    expect(a.reachedEnd).toBe(true)
  })

  it('does not load more once reached-end', async () => {
    apiMock.listLogs.mockResolvedValue([entry('e1')])
    const a = useAuditStore()
    await a.query()
    apiMock.listLogs.mockClear()
    await a.loadMore()
    expect(apiMock.listLogs).not.toHaveBeenCalled()
  })

  it('resolves actor names when the directory is available (rbac.manage)', async () => {
    authMock.can.mockReturnValue(true)
    rbacMock.listUsers.mockResolvedValue([{ id: 'u1', name: 'Ana', email: 'ana@x.co' }])
    const a = useAuditStore()
    await a.loadActorDirectory()
    expect(a.actorName('u1')).toBe('Ana')
    expect(a.actorName('zzzzzzzz9')).toBe('#zzzzzzzz')
    expect(a.actorName(null)).toBe('sistema')
  })

  it('skips the directory without rbac.manage and degrades actor to an id', async () => {
    authMock.can.mockReturnValue(false)
    const a = useAuditStore()
    await a.loadActorDirectory()
    expect(rbacMock.listUsers).not.toHaveBeenCalled()
    expect(a.actorName('u1')).toBe('#u1')
  })

  it('selects an entry from the loaded list', async () => {
    apiMock.listLogs.mockResolvedValue([entry('e1'), entry('e2')])
    const a = useAuditStore()
    await a.query()
    a.select('e2')
    expect(a.selectedEntry?.id).toBe('e2')
  })
})
