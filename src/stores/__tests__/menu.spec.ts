import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// vi.mock is hoisted above module init, so the mock object must be created via vi.hoisted.
const apiMock = vi.hoisted(() => ({
  listCategories: vi.fn<(...a: unknown[]) => unknown>(),
  listProducts: vi.fn<(...a: unknown[]) => unknown>(),
  listAddons: vi.fn<(...a: unknown[]) => unknown>(),
  createCategory: vi.fn<(...a: unknown[]) => unknown>(),
  createProduct: vi.fn<(...a: unknown[]) => unknown>(),
  setProductPrice: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/menu.api', () => apiMock)

import { useMenuStore } from '../menu'

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('menu store', () => {
  it('groups products by category id', async () => {
    apiMock.listProducts.mockResolvedValue([
      { id: 'p1', category_id: 'c1', name: 'A', description: null, image_url: null, is_active: true },
      { id: 'p2', category_id: 'c1', name: 'B', description: null, image_url: null, is_active: true },
      { id: 'p3', category_id: 'c2', name: 'C', description: null, image_url: null, is_active: false },
    ])
    const menu = useMenuStore()
    await menu.fetchProducts()

    expect(menu.productsByCategory['c1']).toHaveLength(2)
    expect(menu.productsByCategory['c2']).toHaveLength(1)
  })

  it('createCategory writes through then refetches the list', async () => {
    apiMock.createCategory.mockResolvedValue({ id: 'c9', name: 'New', position: 0, is_active: true, parent_category_id: null })
    apiMock.listCategories.mockResolvedValue([
      { id: 'c9', name: 'New', position: 0, is_active: true, parent_category_id: null },
    ])
    const menu = useMenuStore()
    await menu.createCategory({ name: 'New' })

    expect(apiMock.createCategory).toHaveBeenCalledWith({ name: 'New' })
    expect(apiMock.listCategories).toHaveBeenCalledOnce()
    expect(menu.categories).toHaveLength(1)
  })

  it('setPrice forwards product, branch and decimal-string price untouched', async () => {
    apiMock.setProductPrice.mockResolvedValue({})
    const menu = useMenuStore()
    await menu.setPrice('p1', 'b1', '23900.00')

    expect(apiMock.setProductPrice).toHaveBeenCalledWith('p1', 'b1', '23900.00', true)
  })

  it('categoryName resolves from loaded categories', async () => {
    apiMock.listCategories.mockResolvedValue([
      { id: 'c1', name: 'Bebidas', position: 0, is_active: true, parent_category_id: null },
    ])
    const menu = useMenuStore()
    await menu.fetchCategories()

    expect(menu.categoryName('c1')).toBe('Bebidas')
    expect(menu.categoryName('nope')).toBeUndefined()
  })
})
