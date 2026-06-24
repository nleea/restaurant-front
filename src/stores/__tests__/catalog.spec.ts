import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listUnits: vi.fn<(...a: unknown[]) => unknown>(),
  createUnit: vi.fn<(...a: unknown[]) => unknown>(),
  updateUnit: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/catalog.api', () => apiMock)

import { useCatalogStore } from '../catalog'

const UNITS = [
  { id: 'u1', name: 'Gramo', abbreviation: 'g', base_unit_id: null, conversion_factor: null },
  { id: 'u2', name: 'Kilogramo', abbreviation: 'kg', base_unit_id: 'u1', conversion_factor: '1000' },
]

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('catalog store', () => {
  it('splits base and derived units', async () => {
    apiMock.listUnits.mockResolvedValue(UNITS)
    const catalog = useCatalogStore()
    await catalog.fetchUnits()

    expect(catalog.baseUnits.map((u) => u.id)).toEqual(['u1'])
    expect(catalog.derivedUnits.map((u) => u.id)).toEqual(['u2'])
  })

  it('createUnit writes through then refetches', async () => {
    apiMock.createUnit.mockResolvedValue(UNITS[0])
    apiMock.listUnits.mockResolvedValue([UNITS[0]])
    const catalog = useCatalogStore()
    await catalog.createUnit({ name: 'Gramo', abbreviation: 'g' })

    expect(apiMock.createUnit).toHaveBeenCalledOnce()
    expect(apiMock.listUnits).toHaveBeenCalledOnce()
    expect(catalog.units).toHaveLength(1)
  })

  it('unitName resolves from loaded units', async () => {
    apiMock.listUnits.mockResolvedValue(UNITS)
    const catalog = useCatalogStore()
    await catalog.fetchUnits()

    expect(catalog.unitName('u2')).toBe('Kilogramo')
  })
})
