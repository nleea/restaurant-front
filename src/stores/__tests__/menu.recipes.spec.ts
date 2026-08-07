import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const menuApi = vi.hoisted(() => ({
  listVariants: vi.fn<(...a: unknown[]) => unknown>(),
  updateVariant: vi.fn<(...a: unknown[]) => unknown>(),
}))
const recipesApi = vi.hoisted(() => ({
  listRecipeItems: vi.fn<(...a: unknown[]) => unknown>(),
  addRecipeItem: vi.fn<(...a: unknown[]) => unknown>(),
  updateRecipeItem: vi.fn<(...a: unknown[]) => unknown>(),
  deleteRecipeItem: vi.fn<(...a: unknown[]) => unknown>(),
  listVariantsMissingRecipe: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/menu.api', () => menuApi)
vi.mock('@/services/recipes.api', () => recipesApi)

import { useMenuStore } from '../menu'

const ITEM = {
  id: 'ri1',
  product_variant_id: 'v1',
  ingredient_id: 'i1',
  quantity: '150.000',
  unit_of_measure_id: 'u1',
}

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(menuApi)) fn.mockReset()
  for (const fn of Object.values(recipesApi)) fn.mockReset()
})

describe('menu store — recipe items', () => {
  it('loadRecipeItems fills the per-variant map and hasRecipe reflects it', async () => {
    const menu = useMenuStore()
    expect(menu.hasRecipe('v1')).toBe(false)
    recipesApi.listRecipeItems.mockResolvedValue([ITEM])
    await menu.loadRecipeItems('v1')
    expect(recipesApi.listRecipeItems).toHaveBeenCalledWith('v1')
    expect(menu.recipeItemsByVariantId['v1']).toHaveLength(1)
    expect(menu.hasRecipe('v1')).toBe(true)
  })

  it('addRecipeItem writes through then refetches the variant items', async () => {
    recipesApi.addRecipeItem.mockResolvedValue(ITEM)
    recipesApi.listRecipeItems.mockResolvedValue([ITEM])
    const menu = useMenuStore()
    await menu.addRecipeItem('v1', { ingredient_id: 'i1', quantity: '150', unit_of_measure_id: 'u1' })
    expect(recipesApi.addRecipeItem).toHaveBeenCalledWith('v1', {
      ingredient_id: 'i1',
      quantity: '150',
      unit_of_measure_id: 'u1',
    })
    expect(recipesApi.listRecipeItems).toHaveBeenCalledWith('v1')
    expect(menu.hasRecipe('v1')).toBe(true)
  })

  it('removeRecipeItem deletes then refetches', async () => {
    recipesApi.deleteRecipeItem.mockResolvedValue(undefined)
    recipesApi.listRecipeItems.mockResolvedValue([])
    const menu = useMenuStore()
    await menu.removeRecipeItem('v1', 'ri1')
    expect(recipesApi.deleteRecipeItem).toHaveBeenCalledWith('ri1')
    expect(menu.hasRecipe('v1')).toBe(false)
  })

  it('loadRecipeItemsForVariants loads each variant in parallel', async () => {
    recipesApi.listRecipeItems.mockResolvedValue([ITEM])
    const menu = useMenuStore()
    await menu.loadRecipeItemsForVariants(['v1', 'v2'])
    expect(recipesApi.listRecipeItems).toHaveBeenCalledTimes(2)
    expect(menu.hasRecipe('v1')).toBe(true)
    expect(menu.hasRecipe('v2')).toBe(true)
  })

  it('setVariantActive patches is_active then refetches the product variants', async () => {
    menuApi.updateVariant.mockResolvedValue({})
    menuApi.listVariants.mockResolvedValue([
      { id: 'v1', product_id: 'p1', name: 'Estándar', is_active: true, extra_price: '0.00' },
    ])
    const menu = useMenuStore()
    await menu.setVariantActive('p1', 'v1', true)
    expect(menuApi.updateVariant).toHaveBeenCalledWith('v1', { is_active: true })
    expect(menuApi.listVariants).toHaveBeenCalledWith('p1')
    expect(menu.variantsByProductId['p1']?.[0]?.is_active).toBe(true)
  })

  it('loadVariantsMissingRecipe holds the stock-guard list', async () => {
    recipesApi.listVariantsMissingRecipe.mockResolvedValue([
      { product_variant_id: 'v1', variant_name: null, product_name: 'Gaseosa' },
    ])
    const menu = useMenuStore()
    await menu.loadVariantsMissingRecipe()
    expect(menu.variantsMissingRecipe).toHaveLength(1)
    expect(menu.variantsMissingRecipe[0]?.product_name).toBe('Gaseosa')
  })
})
