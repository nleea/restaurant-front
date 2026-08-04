import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
const patch = vi.fn<(...a: unknown[]) => unknown>()
const del = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}))

import * as api from '../recipes.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('recipes api layer', () => {
  it('lists ingredients, passing active only when given', async () => {
    get.mockResolvedValue({ data: [{ id: 'i1', name: 'Tomate' }] })
    await api.listIngredients()
    expect(get).toHaveBeenCalledWith('/recipes/ingredients', { params: undefined })
    await api.listIngredients(true)
    expect(get).toHaveBeenLastCalledWith('/recipes/ingredients', { params: { active: 'true' } })
  })

  it('creates and updates an ingredient with category', async () => {
    post.mockResolvedValue({ data: { id: 'i9', name: 'Camarón', category: 'Pescados' } })
    patch.mockResolvedValue({ data: { id: 'i9', name: 'Camarón', category: 'Mariscos' } })
    await api.createIngredient({ name: 'Camarón', category: 'Pescados', unit_of_measure_id: 'u1' })
    expect(post).toHaveBeenCalledWith('/recipes/ingredients', {
      name: 'Camarón',
      category: 'Pescados',
      unit_of_measure_id: 'u1',
    })
    await api.updateIngredient('i9', { category: 'Mariscos' })
    expect(patch).toHaveBeenCalledWith('/recipes/ingredients/i9', { category: 'Mariscos' })
  })

  it('sets and clears an ingredient default station', async () => {
    post.mockResolvedValue({ data: { id: 'i9', default_station_id: 's1' } })
    patch.mockResolvedValue({ data: { id: 'i9', default_station_id: null } })

    await api.createIngredient({
      name: 'Carne',
      unit_of_measure_id: 'u1',
      default_station_id: 's1',
    })
    expect(post).toHaveBeenCalledWith('/recipes/ingredients', {
      name: 'Carne',
      unit_of_measure_id: 'u1',
      default_station_id: 's1',
    })

    // An explicit null clears it — omitting the key would leave it untouched instead.
    await api.updateIngredient('i9', { default_station_id: null })
    expect(patch).toHaveBeenCalledWith('/recipes/ingredients/i9', { default_station_id: null })
  })

  it('fetches the recipe card of a variant', async () => {
    get.mockResolvedValue({
      data: {
        product_variant_id: 'v1',
        ingredients: [{ name: 'Beef', quantity: '180.000', unit: 'g' }],
        steps: ['Sellar la carne'],
        allergens: ['gluten'],
        photo_label: null,
      },
    })
    const card = await api.getRecipeCard('v1')
    expect(get).toHaveBeenCalledWith('/recipes/variants/v1/card')
    expect(card.ingredients[0]?.name).toBe('Beef')
    expect(card.steps).toEqual(['Sellar la carne'])
  })

  it('propagates a 404 so callers can render the quiet no-recipe state', async () => {
    get.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    await expect(api.getRecipeCard('v-none')).rejects.toThrow('404')
  })

  it('lists a variant recipe items, keeping the decimal quantity a string', async () => {
    get.mockResolvedValue({
      data: [
        { id: 'ri1', product_variant_id: 'v1', ingredient_id: 'i1', quantity: '150.000', unit_of_measure_id: 'u1' },
      ],
    })
    const items = await api.listRecipeItems('v1')
    expect(get).toHaveBeenCalledWith('/recipes/variants/v1/items')
    expect(items[0]?.quantity).toBe('150.000')
  })

  it('adds, patches and deletes a recipe item on the right paths', async () => {
    post.mockResolvedValue({ data: { id: 'ri9' } })
    patch.mockResolvedValue({ data: { id: 'ri9' } })
    del.mockResolvedValue(undefined)
    await api.addRecipeItem('v1', { ingredient_id: 'i1', quantity: '2', unit_of_measure_id: 'u1' })
    expect(post).toHaveBeenCalledWith('/recipes/variants/v1/items', {
      ingredient_id: 'i1',
      quantity: '2',
      unit_of_measure_id: 'u1',
    })
    await api.updateRecipeItem('ri9', { quantity: '3' })
    expect(patch).toHaveBeenCalledWith('/recipes/items/ri9', { quantity: '3' })
    await api.deleteRecipeItem('ri9')
    expect(del).toHaveBeenCalledWith('/recipes/items/ri9')
  })

  it('lists active variants missing a recipe', async () => {
    get.mockResolvedValue({
      data: [{ product_variant_id: 'v1', variant_name: 'Grande', product_name: 'Gaseosa' }],
    })
    const missing = await api.listVariantsMissingRecipe()
    expect(get).toHaveBeenCalledWith('/recipes/variants/missing-recipe')
    expect(missing[0]?.product_name).toBe('Gaseosa')
  })
})
