import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({ http: { get: (...a: unknown[]) => get(...a) } }))

import * as api from '../recipes.api'

beforeEach(() => {
  get.mockReset()
})

describe('recipes api layer', () => {
  it('lists ingredients, passing active only when given', async () => {
    get.mockResolvedValue({ data: [{ id: 'i1', name: 'Tomate' }] })
    await api.listIngredients()
    expect(get).toHaveBeenCalledWith('/recipes/ingredients', { params: undefined })
    await api.listIngredients(true)
    expect(get).toHaveBeenLastCalledWith('/recipes/ingredients', { params: { active: 'true' } })
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
})
