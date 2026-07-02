import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listSuppliers: vi.fn<(...a: unknown[]) => unknown>(),
  createSupplier: vi.fn<(...a: unknown[]) => unknown>(),
  updateSupplier: vi.fn<(...a: unknown[]) => unknown>(),
  listSupplierIngredients: vi.fn<(...a: unknown[]) => unknown>(),
  attachIngredient: vi.fn<(...a: unknown[]) => unknown>(),
  detachIngredient: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/purchasing.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

const recipesMock = vi.hoisted(() => ({ listIngredients: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/recipes.api', () => recipesMock)

const catalogMock = vi.hoisted(() => ({
  units: [] as Array<{ id: string; abbreviation: string }>,
  fetchUnits: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/stores/catalog', () => ({ useCatalogStore: () => catalogMock }))

import { usePurchasingStore } from '../purchasing'

const supplier = (id: string, name: string, active = true) => ({
  id,
  name,
  tax_id: null,
  phone: null,
  email: null,
  address: null,
  is_active: active,
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
  recipesMock.listIngredients.mockReset()
  catalogMock.fetchUnits.mockReset()
  catalogMock.units = [{ id: 'u-kg', abbreviation: 'kg' }]
  catalogMock.fetchUnits.mockResolvedValue(undefined)
})

describe('purchasing store', () => {
  it('loads suppliers and exposes the active filter', async () => {
    apiMock.listSuppliers.mockResolvedValue([supplier('s1', 'Distri'), supplier('s2', 'Vieja', false)])
    const p = usePurchasingStore()
    await p.loadSuppliers()
    expect(p.suppliers).toHaveLength(2)
    expect(p.activeSuppliers.map((s) => s.id)).toEqual(['s1'])
  })

  it('builds the ingredient directory and resolves labels with fallback', async () => {
    recipesMock.listIngredients.mockResolvedValue([
      { id: 'i1', name: 'Tomate', unit_of_measure_id: 'u-kg', is_active: true },
    ])
    const p = usePurchasingStore()
    await p.loadDirectory()
    expect(p.ingredientLabel('i1')).toBe('Tomate')
    expect(p.unitAbbrOf('i1')).toBe('kg')
    expect(p.ingredientLabel('abcdef1234')).toBe('#abcdef12')
  })

  it('creating a supplier write-through refetches the list', async () => {
    apiMock.createSupplier.mockResolvedValue(supplier('s9', 'Nueva'))
    apiMock.listSuppliers.mockResolvedValue([supplier('s9', 'Nueva')])
    const p = usePurchasingStore()
    await p.createSupplier({ name: 'Nueva' })
    expect(apiMock.createSupplier).toHaveBeenCalledWith({ name: 'Nueva' })
    expect(p.suppliers).toHaveLength(1)
  })

  it('deactivating a supplier patches is_active false then refetches', async () => {
    apiMock.updateSupplier.mockResolvedValue(supplier('s1', 'Distri', false))
    apiMock.listSuppliers.mockResolvedValue([supplier('s1', 'Distri', false)])
    const p = usePurchasingStore()
    await p.deactivateSupplier('s1')
    expect(apiMock.updateSupplier).toHaveBeenCalledWith('s1', { is_active: false })
    expect(p.suppliers[0]?.is_active).toBe(false)
  })

  it('selecting a supplier loads its catalog; attach/detach write-through refetch', async () => {
    apiMock.listSupplierIngredients
      .mockResolvedValueOnce([{ id: 'si1', ingredient_id: 'i1' }])
      .mockResolvedValueOnce([{ id: 'si1', ingredient_id: 'i1' }, { id: 'si2', ingredient_id: 'i2' }])
    const p = usePurchasingStore()
    await p.selectSupplier('s1')
    expect(apiMock.listSupplierIngredients).toHaveBeenCalledWith('s1')
    expect(p.catalog).toHaveLength(1)
    await p.attachIngredient('s1', {
      ingredient_id: 'i2',
      reference_price: '1200.00',
      unit_of_measure_id: 'u-kg',
    })
    expect(apiMock.attachIngredient).toHaveBeenCalledWith('s1', expect.objectContaining({ ingredient_id: 'i2' }))
    expect(p.catalog).toHaveLength(2)
  })

  it('does not refetch the catalog for a supplier that is not selected', async () => {
    apiMock.listSupplierIngredients.mockResolvedValue([])
    const p = usePurchasingStore()
    await p.selectSupplier('s1')
    apiMock.listSupplierIngredients.mockClear()
    await p.detachIngredient('other', 'i1')
    expect(apiMock.detachIngredient).toHaveBeenCalledWith('other', 'i1')
    expect(apiMock.listSupplierIngredients).not.toHaveBeenCalled()
  })
})
