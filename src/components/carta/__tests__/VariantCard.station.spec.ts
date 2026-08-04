// El override de estación por línea de receta.
//
// "¿Dónde va el arroz?" no tiene respuesta global: se cocina en un plato y se fríe en otro. El
// default del insumo cubre el caso normal; esta línea es el par (plato, insumo) donde la
// excepción sí se puede decir. Lo que se protege: que vacío signifique "usa el default" y no
// "sin estación", porque son cosas distintas y confundirlas rompe la derivación.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const authMock = vi.hoisted(() => ({ can: vi.fn<(c: string) => boolean>(() => true) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authMock }))

const menuMock = vi.hoisted(() => ({
  recipeItemsByVariantId: {} as Record<string, unknown[]>,
  ingredients: [{ id: 'i1', name: 'Arroz', unit_of_measure_id: 'u1' }],
  ingredientName: (id: string) => (id === 'i1' ? 'Arroz' : null),
  // El medidor de food-cost no es lo que se prueba aquí; se le da una forma válida y en cero.
  recipeCost: () => ({ total: 0, complete: false, missing: 0 }),
  unitCostOf: () => null,
  api: {},
  updateRecipeItem: vi.fn<(...a: unknown[]) => unknown>(),
  addRecipeItem: vi.fn<(...a: unknown[]) => unknown>(),
  removeRecipeItem: vi.fn<(...a: unknown[]) => unknown>(),
  loadRecipeItems: vi.fn<(...a: unknown[]) => unknown>(),
  createIngredient: vi.fn<(...a: unknown[]) => unknown>(),
  renameVariant: vi.fn<(...a: unknown[]) => unknown>(),
  setVariantActive: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/stores/menu', () => ({ useMenuStore: () => menuMock }))

const kitchenMock = vi.hoisted(() => ({
  stations: [
    { id: 'st1', branch_id: 'b1', name: 'Plancha', position: 0, is_active: true },
    { id: 'st2', branch_id: 'b1', name: 'Freidora', position: 1, is_active: true },
  ],
}))
vi.mock('@/stores/kitchen', () => ({ useKitchenStore: () => kitchenMock }))

const catalogMock = vi.hoisted(() => ({
  units: [{ id: 'u1', abbreviation: 'kg', name: 'Kilogramo' }],
  fetchUnits: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/stores/catalog', () => ({ useCatalogStore: () => catalogMock }))

import VariantCard from '../VariantCard.vue'

const LINE = {
  id: 'ri1',
  product_variant_id: 'v1',
  ingredient_id: 'i1',
  quantity: '0.200',
  unit_of_measure_id: 'u1',
  station_id: null as string | null,
}

const mountCard = () =>
  mount(VariantCard, {
    props: {
      variant: { id: 'v1', product_id: 'p1', name: 'Única', is_active: false },
    } as never,
    global: { stubs: { Button: true, InputText: true, Select: true, Dialog: true } },
  })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  authMock.can.mockImplementation(() => true)
  menuMock.recipeItemsByVariantId = { v1: [{ ...LINE }] }
  menuMock.updateRecipeItem.mockResolvedValue(undefined)
  menuMock.loadRecipeItems.mockResolvedValue(undefined)
})

describe('estación por línea de receta', () => {
  it('ofrece «por defecto» además de las estaciones de la sede', async () => {
    const wrapper = mountCard()
    await flushPromises()

    const options = wrapper.findAll('[data-line-station] option').map((o) => o.text())
    expect(options).toContain('por defecto')
    expect(options).toContain('Freidora')
  })

  it('fijar una estación guarda el override de esta línea', async () => {
    const wrapper = mountCard()
    await flushPromises()

    await wrapper.find('[data-line-station]').setValue('st2')
    await flushPromises()

    expect(menuMock.updateRecipeItem).toHaveBeenCalledWith('v1', 'ri1', {
      station_id: 'st2',
    })
  })

  it('volver a «por defecto» manda null, no una cadena vacía', async () => {
    // Null es "usa el default del insumo"; "" no significa nada para el servidor.
    menuMock.recipeItemsByVariantId = { v1: [{ ...LINE, station_id: 'st2' }] }
    const wrapper = mountCard()
    await flushPromises()

    await wrapper.find('[data-line-station]').setValue('')
    await flushPromises()

    expect(menuMock.updateRecipeItem).toHaveBeenCalledWith('v1', 'ri1', {
      station_id: null,
    })
  })

  it('elegir la que ya estaba no escribe', async () => {
    menuMock.recipeItemsByVariantId = { v1: [{ ...LINE, station_id: 'st2' }] }
    const wrapper = mountCard()
    await flushPromises()

    await wrapper.find('[data-line-station]').setValue('st2')
    await flushPromises()

    expect(menuMock.updateRecipeItem).not.toHaveBeenCalled()
  })
})
