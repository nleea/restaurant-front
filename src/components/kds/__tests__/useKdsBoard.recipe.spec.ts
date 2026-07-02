import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const recipesMock = vi.hoisted(() => ({
  getRecipeCard: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/recipes.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, getRecipeCard: (...a: unknown[]) => recipesMock.getRecipeCard(...a) }
})

// The board is a module singleton over Pinia stores: activate one Pinia for the whole file
// BEFORE the first useKdsBoard() call and mutate store state per test.
setActivePinia(createPinia())

import { useKdsBoard } from '../useKdsBoard'
import { useKitchenStore } from '@/stores/kitchen'

const board = useKdsBoard()
const kitchen = useKitchenStore()

const CARD = {
  product_variant_id: 'v1',
  ingredients: [{ name: 'Beef', quantity: '180.000', unit: 'g' }],
  steps: ['Sellar la carne'],
  allergens: ['gluten'],
  photo_label: null,
}

function seedBoard(variantId: string | null): void {
  kitchen.stations = [{ id: 's1', branch_id: 'b1', name: 'Parrilla', position: 0, is_active: true }]
  kitchen.itemIndex = {
    i1: {
      label: 'Hamburguesa',
      quantity: 1,
      orderId: 'o1',
      channel: 'dine_in',
      tableNumber: '4',
      variantId,
    },
  }
  kitchen.ticketsByStation = {
    s1: [
      {
        id: 't1',
        branch_id: 'b1',
        order_item_id: 'i1',
        kitchen_station_id: 's1',
        status: 'pending',
        entered_at: null,
        ready_at: null,
        role: null,
        tasks: [],
      },
    ],
  }
}

beforeEach(() => {
  recipesMock.getRecipeCard.mockReset()
  board.closeRecipe()
})

describe('recipe drawer states', () => {
  it('opens directly in the quiet no-recipe state when the dish has no variant', async () => {
    seedBoard(null)
    await board.openRecipe('o1', 'i1')
    expect(board.recipeDrawer.value?.status).toBe('none')
    expect(recipesMock.getRecipeCard).not.toHaveBeenCalled()
  })

  it('shows loading, then the backend card', async () => {
    seedBoard('v1')
    let resolve!: (v: unknown) => void
    recipesMock.getRecipeCard.mockReturnValue(new Promise((r) => (resolve = r)))

    const opening = board.openRecipe('o1', 'i1')
    expect(board.recipeDrawer.value?.status).toBe('loading')
    expect(board.recipeDrawer.value?.itemName).toBe('Hamburguesa')

    resolve(CARD)
    await opening
    expect(recipesMock.getRecipeCard).toHaveBeenCalledWith('v1')
    expect(board.recipeDrawer.value?.status).toBe('card')
    expect(board.recipeDrawer.value?.card?.steps).toEqual(['Sellar la carne'])
  })

  it('degrades to the quiet no-recipe state when the card 404s', async () => {
    seedBoard('v1')
    recipesMock.getRecipeCard.mockRejectedValue(
      Object.assign(new Error('404'), { response: { status: 404 } }),
    )
    await board.openRecipe('o1', 'i1')
    expect(board.recipeDrawer.value?.status).toBe('none')
    expect(board.recipeDrawer.value?.card).toBeNull()
  })

  it('drops a stale fetch when another recipe was opened meanwhile', async () => {
    seedBoard('v1')
    let resolveFirst!: (v: unknown) => void
    recipesMock.getRecipeCard.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
    const first = board.openRecipe('o1', 'i1')

    // user closes (or opens another dish) while the first card is in flight
    board.closeRecipe()
    resolveFirst(CARD)
    await first
    expect(board.recipeDrawer.value).toBeNull()
  })
})
