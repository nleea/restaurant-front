import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listStock: vi.fn<(...a: unknown[]) => unknown>(),
  listLowStock: vi.fn<(...a: unknown[]) => unknown>(),
  getStock: vi.fn<(...a: unknown[]) => unknown>(),
  setThreshold: vi.fn<(...a: unknown[]) => unknown>(),
  registerMovement: vi.fn<(...a: unknown[]) => unknown>(),
  recount: vi.fn<(...a: unknown[]) => unknown>(),
  listMovements: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/inventory.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

const recipesMock = vi.hoisted(() => ({ listIngredients: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/recipes.api', () => recipesMock)

// Minimal catalog store stub: units array + fetchUnits, accessed by the inventory store.
const catalogMock = vi.hoisted(() => ({
  units: [] as Array<{ id: string; abbreviation: string }>,
  fetchUnits: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/stores/catalog', () => ({ useCatalogStore: () => catalogMock }))

import { useInventoryStore } from '../inventory'

const stock = (ingredientId: string, current: string, min: string) => ({
  id: `s-${ingredientId}`,
  branch_id: 'b1',
  ingredient_id: ingredientId,
  current_quantity: current,
  min_stock: min,
  updated_at: null,
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
  recipesMock.listIngredients.mockReset()
  catalogMock.fetchUnits.mockReset()
  catalogMock.units = [{ id: 'u-kg', abbreviation: 'kg' }]
  catalogMock.fetchUnits.mockResolvedValue(undefined)
})

describe('inventory store', () => {
  it('loads stock and builds the ingredient label index from ingredients × units', async () => {
    apiMock.listStock.mockResolvedValue([stock('i1', '3.000', '5.000')])
    recipesMock.listIngredients.mockResolvedValue([
      { id: 'i1', name: 'Tomate', unit_of_measure_id: 'u-kg', is_active: true },
    ])
    const inv = useInventoryStore()
    await inv.loadBranch('b1')
    expect(apiMock.listStock).toHaveBeenCalledWith('b1')
    expect(inv.ingredientLabel('i1')).toBe('Tomate')
    expect(inv.rows[0]?.unitAbbr).toBe('kg')
  })

  it('falls back to a short ref when an ingredient is not in the directory', async () => {
    apiMock.listStock.mockResolvedValue([stock('abcdef1234', '1.000', '0.000')])
    recipesMock.listIngredients.mockResolvedValue([])
    const inv = useInventoryStore()
    await inv.loadBranch('b1')
    expect(inv.ingredientLabel('abcdef1234')).toBe('#abcdef12')
    expect(inv.rows[0]?.name).toBe('#abcdef12')
  })

  it('flags low stock and orders low rows first then by name', async () => {
    apiMock.listStock.mockResolvedValue([
      stock('i1', '10.000', '5.000'), // ok
      stock('i2', '2.000', '5.000'), // low
      stock('i3', '5.000', '5.000'), // low (at threshold)
    ])
    recipesMock.listIngredients.mockResolvedValue([
      { id: 'i1', name: 'Aceite', unit_of_measure_id: 'u-kg', is_active: true },
      { id: 'i2', name: 'Zanahoria', unit_of_measure_id: 'u-kg', is_active: true },
      { id: 'i3', name: 'Cebolla', unit_of_measure_id: 'u-kg', is_active: true },
    ])
    const inv = useInventoryStore()
    await inv.loadBranch('b1')
    expect(inv.lowRows.map((r) => r.name)).toEqual(['Cebolla', 'Zanahoria'])
    // ok row sinks below the low ones
    expect(inv.rows[inv.rows.length - 1]?.name).toBe('Aceite')
  })

  it('registering a movement write-through refetches stock and selected history', async () => {
    apiMock.listStock.mockResolvedValueOnce([stock('i1', '3.000', '5.000')])
    recipesMock.listIngredients.mockResolvedValue([
      { id: 'i1', name: 'Tomate', unit_of_measure_id: 'u-kg', is_active: true },
    ])
    apiMock.listMovements.mockResolvedValue([{ id: 'm1' }])
    const inv = useInventoryStore()
    await inv.loadBranch('b1')
    await inv.selectIngredient('i1')

    apiMock.listStock.mockResolvedValueOnce([stock('i1', '13.000', '5.000')])
    apiMock.listMovements.mockResolvedValue([{ id: 'm2' }, { id: 'm1' }])
    await inv.registerMovement({
      ingredient_id: 'i1',
      employee_id: 'e1',
      type: 'in',
      quantity: '10.000',
      reason: 'received',
    })
    expect(apiMock.registerMovement).toHaveBeenCalledWith('b1', expect.objectContaining({ ingredient_id: 'i1' }))
    expect(inv.selectedStock?.current_quantity).toBe('13.000')
    expect(inv.movements).toHaveLength(2)
  })

  it('recount write-through refetches stock', async () => {
    apiMock.listStock.mockResolvedValueOnce([stock('i1', '10.000', '5.000')])
    recipesMock.listIngredients.mockResolvedValue([
      { id: 'i1', name: 'Tomate', unit_of_measure_id: 'u-kg', is_active: true },
    ])
    const inv = useInventoryStore()
    await inv.loadBranch('b1')
    apiMock.listStock.mockResolvedValueOnce([stock('i1', '8.000', '5.000')])
    await inv.recount({ ingredient_id: 'i1', employee_id: 'e1', counted_quantity: '8.000' })
    expect(apiMock.recount).toHaveBeenCalledWith('b1', expect.objectContaining({ counted_quantity: '8.000' }))
    expect(inv.selectedStock).toBeNull() // nothing selected
    expect(inv.stock[0]?.current_quantity).toBe('8.000')
  })

  it('setThreshold write-through refetches stock', async () => {
    apiMock.listStock.mockResolvedValueOnce([stock('i1', '10.000', '5.000')])
    recipesMock.listIngredients.mockResolvedValue([])
    const inv = useInventoryStore()
    await inv.loadBranch('b1')
    apiMock.listStock.mockResolvedValueOnce([stock('i1', '10.000', '12.000')])
    await inv.setThreshold('i1', '12.000')
    expect(apiMock.setThreshold).toHaveBeenCalledWith('b1', { ingredient_id: 'i1', min_stock: '12.000' })
    expect(inv.rows[0]?.low).toBe(true) // 10 <= 12
  })
})
