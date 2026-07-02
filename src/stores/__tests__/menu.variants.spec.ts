import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listVariants: vi.fn<(...a: unknown[]) => unknown>(),
  createVariant: vi.fn<(...a: unknown[]) => unknown>(),
  updateVariant: vi.fn<(...a: unknown[]) => unknown>(),
  deleteVariant: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/menu.api', () => apiMock)

import { useMenuStore } from '../menu'

const VARIANTS = [
  { id: 'v1', product_id: 'p1', name: 'Estándar', is_active: true, extra_price: '0.00' },
  { id: 'v2', product_id: 'p1', name: 'Grande', is_active: true, extra_price: '3500.00' },
]

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('menu store — variants', () => {
  it('loads variants per product, keeping extra_price untouched', async () => {
    apiMock.listVariants.mockResolvedValue(VARIANTS)
    const menu = useMenuStore()
    await menu.loadVariants('p1')
    expect(apiMock.listVariants).toHaveBeenCalledWith('p1')
    expect(menu.variantsByProductId['p1']).toHaveLength(2)
    expect(menu.variantsByProductId['p1']?.[1]?.extra_price).toBe('3500.00')
  })

  it('addVariant forwards input then refetches the product variants', async () => {
    apiMock.createVariant.mockResolvedValue(VARIANTS[0])
    apiMock.listVariants.mockResolvedValue([VARIANTS[0]])
    const menu = useMenuStore()
    const created = await menu.addVariant('p1', { name: 'Estándar' })
    expect(apiMock.createVariant).toHaveBeenCalledWith('p1', { name: 'Estándar' })
    expect(apiMock.listVariants).toHaveBeenCalledWith('p1')
    expect(created.id).toBe('v1')
  })

  it('removeVariant deletes then refetches', async () => {
    apiMock.deleteVariant.mockResolvedValue(undefined)
    apiMock.listVariants.mockResolvedValue([])
    const menu = useMenuStore()
    await menu.removeVariant('p1', 'v1')
    expect(apiMock.deleteVariant).toHaveBeenCalledWith('v1')
    expect(menu.variantsByProductId['p1']).toEqual([])
  })

  it('renameVariant patches the name then refetches', async () => {
    apiMock.updateVariant.mockResolvedValue({ ...VARIANTS[0], name: 'Sencilla' })
    apiMock.listVariants.mockResolvedValue([{ ...VARIANTS[0], name: 'Sencilla' }])
    const menu = useMenuStore()
    await menu.renameVariant('p1', 'v1', 'Sencilla')
    expect(apiMock.updateVariant).toHaveBeenCalledWith('v1', { name: 'Sencilla' })
    expect(menu.variantsByProductId['p1']?.[0]?.name).toBe('Sencilla')
  })
})
