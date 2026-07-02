import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// vi.mock is hoisted above module init, so the mock object must be created via vi.hoisted.
const apiMock = vi.hoisted(() => ({
  listBranches: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/branch.api', () => apiMock)

import { useBranchStore } from '../branch'

const STORAGE_KEY = 'restaurante.activeBranchId'

const BRANCHES = [
  { id: 'b-centro', code: 'C-02', name: 'Centro', is_primary: false },
  { id: 'b-main', code: 'C-01', name: 'Principal', is_primary: true },
]

beforeEach(() => {
  setActivePinia(createPinia())
  apiMock.listBranches.mockReset()
  localStorage.clear()
})

describe('branch store', () => {
  it('fetches the branch list on first ensureLoaded', async () => {
    apiMock.listBranches.mockResolvedValue(BRANCHES)
    const branch = useBranchStore()
    await branch.ensureLoaded()
    expect(apiMock.listBranches).toHaveBeenCalledTimes(1)
    expect(branch.branches).toHaveLength(2)
    expect(branch.hasMultipleBranches).toBe(true)
  })

  it('does not refetch once loaded (idempotent)', async () => {
    apiMock.listBranches.mockResolvedValue(BRANCHES)
    const branch = useBranchStore()
    await branch.ensureLoaded()
    await branch.ensureLoaded()
    expect(apiMock.listBranches).toHaveBeenCalledTimes(1)
  })

  it('defaults the active branch to the primary one', async () => {
    apiMock.listBranches.mockResolvedValue(BRANCHES)
    const branch = useBranchStore()
    await branch.ensureLoaded()
    expect(branch.activeBranchId).toBe('b-main')
    expect(branch.activeBranch?.name).toBe('Principal')
  })

  it('falls back to the first branch when none is primary', async () => {
    apiMock.listBranches.mockResolvedValue([
      { id: 'b1', code: 'A', name: 'A', is_primary: false },
      { id: 'b2', code: 'B', name: 'B', is_primary: false },
    ])
    const branch = useBranchStore()
    await branch.ensureLoaded()
    expect(branch.activeBranchId).toBe('b1')
  })

  it('reports no active branch when the list is empty', async () => {
    apiMock.listBranches.mockResolvedValue([])
    const branch = useBranchStore()
    await branch.ensureLoaded()
    expect(branch.hasActiveBranch).toBe(false)
    expect(branch.activeBranchId).toBeNull()
  })

  it('restores a still-valid persisted selection over the default', async () => {
    localStorage.setItem(STORAGE_KEY, 'b-centro')
    apiMock.listBranches.mockResolvedValue(BRANCHES)
    const branch = useBranchStore()
    await branch.ensureLoaded()
    expect(branch.activeBranchId).toBe('b-centro')
  })

  it('discards a stale persisted id and applies the default', async () => {
    localStorage.setItem(STORAGE_KEY, 'b-gone')
    apiMock.listBranches.mockResolvedValue(BRANCHES)
    const branch = useBranchStore()
    await branch.ensureLoaded()
    expect(branch.activeBranchId).toBe('b-main')
  })

  it('setActiveBranch switches and persists a known branch', async () => {
    apiMock.listBranches.mockResolvedValue(BRANCHES)
    const branch = useBranchStore()
    await branch.ensureLoaded()
    branch.setActiveBranch('b-centro')
    expect(branch.activeBranchId).toBe('b-centro')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('b-centro')
  })

  it('setActiveBranch ignores an unknown branch id', async () => {
    apiMock.listBranches.mockResolvedValue(BRANCHES)
    const branch = useBranchStore()
    await branch.ensureLoaded()
    branch.setActiveBranch('nope')
    expect(branch.activeBranchId).toBe('b-main')
  })
})
