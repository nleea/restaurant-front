// Configuración de cocina, después de sacarle la asignación de platos.
//
// Lo que se protege: que la pantalla ARRANQUE por lo pendiente (platos que nadie prepara) en vez
// de esperar a que alguien piense en revisarlo, y que montar la línea no exija llevar la cuenta
// de un número de posición a mano.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  listStations: vi.fn<(...a: unknown[]) => unknown>(),
  createStation: vi.fn<(...a: unknown[]) => unknown>(),
  updateStation: vi.fn<(...a: unknown[]) => unknown>(),
  listUnroutableProducts: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/kitchen.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...api,
}))

const branchMock = vi.hoisted(() => ({
  activeBranchId: 'b1',
  ensureLoaded: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/stores/branch', () => ({ useBranchStore: () => branchMock }))

vi.mock('vue-router', () => ({
  RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
}))

import PrimeVue from 'primevue/config'

import KitchenSetup from '../KitchenSetup.vue'
import { useKitchenStore } from '@/stores/kitchen'

const station = (id: string, name: string, position: number, isActive = true) => ({
  id,
  branch_id: 'b1',
  name,
  position,
  is_active: isActive,
})

const product = (over: Record<string, unknown> = {}) => ({
  product_id: 'p1',
  name: 'Salchipapa',
  category_name: 'Rápidas',
  active_variants: 2,
  ...over,
})

function seed(stations: ReturnType<typeof station>[]) {
  const kitchen = useKitchenStore()
  kitchen.stations = stations as never
  return kitchen
}

const mountSetup = () =>
  mount(KitchenSetup, {
    global: { plugins: [PrimeVue], stubs: { ToggleSwitch: true } },
  })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  branchMock.activeBranchId = 'b1'
  api.listStations.mockImplementation(async () => useKitchenStore().stations)
  api.createStation.mockResolvedValue({})
  api.updateStation.mockResolvedValue({})
  api.listUnroutableProducts.mockResolvedValue([])
})

describe('lo pendiente va primero', () => {
  it('nombra los platos que nadie prepara y marca los que ya se venden', async () => {
    api.listUnroutableProducts.mockResolvedValue([
      product(),
      product({ product_id: 'p2', name: 'Borrador', active_variants: 0 }),
    ])
    seed([station('s1', 'Parrilla', 0)])
    const wrapper = mountSetup()
    await flushPromises()

    expect(wrapper.text()).toContain('Platos que nadie prepara · 2')
    expect(wrapper.text()).toContain('Salchipapa')
    expect(wrapper.text()).toContain('2 a la venta')
    // Lo urgente se distingue de la ficha a medio crear.
    expect(wrapper.text()).toContain('se vende')
    expect(wrapper.text()).toContain('sin variantes activas')
  })

  it('manda a la carta, que es donde se asignan', async () => {
    api.listUnroutableProducts.mockResolvedValue([product()])
    seed([])
    const wrapper = mountSetup()
    await flushPromises()

    expect(wrapper.text()).toContain('Ir a la carta a asignarlas')
  })

  it('sin pendientes no muestra la alerta', async () => {
    seed([station('s1', 'Parrilla', 0)])
    const wrapper = mountSetup()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Platos que nadie prepara')
  })
})

describe('montar la línea', () => {
  it('ordena por posición, no por orden de llegada', async () => {
    seed([station('s2', 'Fríos', 1), station('s1', 'Parrilla', 0)])
    const wrapper = mountSetup()
    await flushPromises()

    const names = wrapper
      .findAll('[data-station-name]')
      .map((i) => (i.element as HTMLInputElement).value)
    expect(names).toEqual(['Parrilla', 'Fríos'])
  })

  it('la nueva estación nace al final, sin pedir un número', async () => {
    seed([station('s1', 'Parrilla', 0), station('s2', 'Fríos', 1)])
    const wrapper = mountSetup()
    await flushPromises()

    await wrapper.find('input#st-name').setValue('Bebidas')
    await wrapper.find('button.p-button').trigger('click')
    await flushPromises()

    expect(api.createStation).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: 'b1', name: 'Bebidas', position: 2 }),
    )
  })

  it('subir una estación intercambia su posición con la vecina', async () => {
    seed([station('s1', 'Parrilla', 0), station('s2', 'Fríos', 1)])
    const wrapper = mountSetup()
    await flushPromises()

    // La flecha de subir de la SEGUNDA fila.
    await wrapper.findAll('[data-move-up]')[1]!.trigger('click')
    await flushPromises()

    expect(api.updateStation).toHaveBeenCalledWith('s2', { position: 0 })
    expect(api.updateStation).toHaveBeenCalledWith('s1', { position: 1 })
  })

  it('la primera no sube y la última no baja', async () => {
    seed([station('s1', 'Parrilla', 0), station('s2', 'Fríos', 1)])
    const wrapper = mountSetup()
    await flushPromises()

    const ups = wrapper.findAll('[data-move-up]')
    const downs = wrapper.findAll('[data-move-down]')
    expect((ups[0]!.element as HTMLButtonElement).disabled).toBe(true)
    expect((downs[1]!.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('renombra en su sitio', async () => {
    seed([station('s1', 'Parilla', 0)])
    const wrapper = mountSetup()
    await flushPromises()

    const name = wrapper.find('[data-station-name]')
    await name.setValue('Parrilla')
    await name.trigger('change')
    await flushPromises()

    expect(api.updateStation).toHaveBeenCalledWith('s1', { name: 'Parrilla' })
  })

  it('un nombre en blanco no borra el que había', async () => {
    seed([station('s1', 'Parrilla', 0)])
    const wrapper = mountSetup()
    await flushPromises()

    const name = wrapper.find('[data-station-name]')
    await name.setValue('   ')
    await name.trigger('change')
    await flushPromises()

    expect(api.updateStation).not.toHaveBeenCalled()
  })

  it('sin estaciones explica para qué sirven, en vez de un "Sin estaciones" seco', async () => {
    seed([])
    const wrapper = mountSetup()
    await flushPromises()

    expect(wrapper.text()).toContain('parrilla, fríos, bebidas')
  })
})
