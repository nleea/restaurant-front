// La pantalla que faltaba. Lo que se protege: que un plato sin estación LO DIGA, y que
// asignarle una sea posible desde donde se crea el plato.
//
// La API y las acciones del store existían desde siempre; ninguna pantalla las llamaba, así que
// todo plato nuevo nacía invisible para la cocina sin forma de arreglarlo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const authMock = vi.hoisted(() => ({ can: vi.fn<(c: string) => boolean>(() => true) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authMock }))

const api = vi.hoisted(() => ({
  listProductStations: vi.fn<(...a: unknown[]) => unknown>(),
  attachProductStation: vi.fn<(...a: unknown[]) => unknown>(),
  detachProductStation: vi.fn<(...a: unknown[]) => unknown>(),
  updateProductStation: vi.fn<(...a: unknown[]) => unknown>(),
  listUnroutableProducts: vi.fn<(...a: unknown[]) => unknown>(),
  getStationSuggestion: vi.fn<(...a: unknown[]) => unknown>(),
}))

const branchMock = vi.hoisted(() => ({
  activeBranchId: 'b1',
  ensureLoaded: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/stores/branch', () => ({ useBranchStore: () => branchMock }))
vi.mock('@/services/kitchen.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...api,
}))

import StationsPanel from '../StationsPanel.vue'
import { useKitchenStore } from '@/stores/kitchen'

const PRODUCT = 'p1'
const mapping = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  product_id: PRODUCT,
  kitchen_station_id: 'st1',
  role: null,
  tasks: [],
  ...over,
})

function seed(mappings: ReturnType<typeof mapping>[]) {
  const kitchen = useKitchenStore()
  kitchen.stations = [
    { id: 'st1', branch_id: 'b1', name: 'Parrilla', is_active: true },
    { id: 'st2', branch_id: 'b1', name: 'Freidora', is_active: true },
  ] as never
  kitchen.stationsByProduct = { [PRODUCT]: mappings as never }
  return kitchen
}

const mountPanel = () => mount(StationsPanel, { props: { productId: PRODUCT } })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  authMock.can.mockImplementation(() => true)
  api.listProductStations.mockImplementation(
    async () => useKitchenStore().stationsByProduct[PRODUCT] ?? [],
  )
  api.attachProductStation.mockResolvedValue({})
  api.detachProductStation.mockResolvedValue(undefined)
  api.updateProductStation.mockResolvedValue({})
  api.getStationSuggestion.mockResolvedValue(suggestion())
  branchMock.activeBranchId = 'b1'
})

const suggestion = (over: Record<string, unknown> = {}) => ({
  stations: [
    {
      station_id: 'st1',
      station_name: 'Parrilla',
      tasks: [
        { label: 'Carne', ingredient_id: 'i1', amounts: ['150 g', '300 g'] },
        { label: 'Fundir queso', ingredient_id: 'i2', amounts: ['30 g'] },
      ],
      from_variants: ['Grande'],
      missing_from_saved: [],
      saved_no_longer_implied: [],
    },
  ],
  unassigned_ingredients: [],
  ...over,
})

describe('un plato sin estación', () => {
  it('dice que no se puede vender, y por qué', async () => {
    seed([])
    const wrapper = mountPanel()
    await flushPromises()

    const warning = wrapper.find('[data-no-station]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('no se puede vender')
    expect(warning.text()).toContain('la cocina nunca lo vería')
  })

  it('con estación asignada ya no avisa', async () => {
    seed([mapping()])
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.find('[data-no-station]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Parrilla')
  })
})

describe('asignar y quitar', () => {
  it('asigna la estación elegida', async () => {
    seed([])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-station-picker]').setValue('st2')
    await wrapper.find('[data-attach-station]').trigger('click')
    await flushPromises()

    expect(api.attachProductStation).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: PRODUCT, kitchen_station_id: 'st2' }),
    )
  })

  it('no ofrece una estación ya asignada: mapearla dos veces da conflicto', async () => {
    seed([mapping({ kitchen_station_id: 'st1' })])
    const wrapper = mountPanel()
    await flushPromises()

    const options = wrapper.findAll('[data-station-picker] option').map((o) => o.text())
    expect(options).not.toContain('Parrilla')
    expect(options).toContain('Freidora')
  })

  it('quita una estación', async () => {
    seed([mapping()])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-detach-station]').trigger('click')
    await flushPromises()

    expect(api.detachProductStation).toHaveBeenCalledWith(PRODUCT, 'st1')
  })

  it('guarda qué hace esa estación con este plato', async () => {
    seed([mapping()])
    const wrapper = mountPanel()
    await flushPromises()

    const role = wrapper.find('[data-station-role]')
    await role.setValue('Carne y armado')
    await role.trigger('change')
    await flushPromises()

    expect(api.updateProductStation).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ role: 'Carne y armado' }),
    )
  })

  it('un rol en blanco se guarda como vacío, no como espacios', async () => {
    seed([mapping({ role: 'Algo' })])
    const wrapper = mountPanel()
    await flushPromises()

    const role = wrapper.find('[data-station-role]')
    await role.setValue('   ')
    await role.trigger('change')
    await flushPromises()

    expect(api.updateProductStation).toHaveBeenCalledWith('m1', { role: null })
  })
})

describe('qué le toca a cada estación', () => {
  const derived = { label: 'Carne de res', ingredient_id: 'i1' }

  it('renombrar una tarea derivada NO la desconecta de su insumo', async () => {
    // Ese vínculo es lo único que permite que la doble diga 300 g y la sencilla 150 g.
    seed([mapping({ tasks: [derived] })])
    const wrapper = mountPanel()
    await flushPromises()

    const task = wrapper.find('[data-station-tasks]')
    await task.setValue('Carne')
    await task.trigger('change')
    await flushPromises()

    expect(api.updateProductStation).toHaveBeenCalledWith('m1', {
      tasks: [{ label: 'Carne', ingredient_id: 'i1' }],
    })
  })

  it('un paso que no es insumo nace sin receta detrás', async () => {
    seed([mapping({ tasks: [derived] })])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-new-task]').setValue('Emplatar')
    await wrapper.find('[data-add-task]').trigger('click')
    await flushPromises()

    expect(api.updateProductStation).toHaveBeenCalledWith('m1', {
      tasks: [derived, { label: 'Emplatar', ingredient_id: null }],
    })
  })

  it('quita una tarea', async () => {
    seed([mapping({ tasks: [derived, { label: 'Emplatar', ingredient_id: null }] })])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.findAll('[data-remove-task]')[1]!.trigger('click')
    await flushPromises()

    expect(api.updateProductStation).toHaveBeenCalledWith('m1', { tasks: [derived] })
  })

  it('un renombre en blanco no borra la etiqueta que había', async () => {
    seed([mapping({ tasks: [derived] })])
    const wrapper = mountPanel()
    await flushPromises()

    const task = wrapper.find('[data-station-tasks]')
    await task.setValue('   ')
    await task.trigger('change')
    await flushPromises()

    expect(api.updateProductStation).not.toHaveBeenCalled()
  })
})

// La pregunta que dejaba tildado a cualquiera aquí — «¿y qué le pongo a cada estación?» — tiene
// respuesta en la receta del plato. Esto la trae. Lo que se protege: que PROPONGA y no guarde.
describe('sugerir desde la receta', () => {
  it('propone estaciones y tareas sin escribir nada', async () => {
    seed([])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    expect(api.getStationSuggestion).toHaveBeenCalledWith(PRODUCT, 'b1')
    expect(wrapper.find('[data-derive-draft]').text()).toContain('Parrilla')
    // El panel muestra lo que la chit va a decir, incluidas las dos cantidades.
    expect(wrapper.find('[data-derive-draft]').text()).toContain('150 g / 300 g')
    expect(api.attachProductStation).not.toHaveBeenCalled()
    expect(api.updateProductStation).not.toHaveBeenCalled()
  })

  it('guarda lo que la persona editó, no la sugerencia cruda', async () => {
    seed([])
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    // Renombrar la fila derivada conserva su insumo: la cantidad se sigue resolviendo.
    await wrapper.findAll('[data-draft-tasks]')[0]!.setValue('Carne')
    await wrapper.find('[data-confirm-derive]').trigger('click')
    await flushPromises()

    expect(api.attachProductStation).toHaveBeenCalledWith(
      expect.objectContaining({
        kitchen_station_id: 'st1',
        tasks: [
          { label: 'Carne', ingredient_id: 'i1' },
          { label: 'Fundir queso', ingredient_id: 'i2' },
        ],
      }),
    )
  })

  it('descartar no toca nada', async () => {
    seed([])
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-discard-derive]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-derive-draft]').exists()).toBe(false)
    expect(api.attachProductStation).not.toHaveBeenCalled()
  })

  it('reconcilia por update cuando la estación ya estaba asignada', async () => {
    seed([mapping({ kitchen_station_id: 'st1' })])
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-confirm-derive]').trigger('click')
    await flushPromises()

    expect(api.updateProductStation).toHaveBeenCalledWith('m1', {
      tasks: [
        { label: 'Carne', ingredient_id: 'i1' },
        { label: 'Fundir queso', ingredient_id: 'i2' },
      ],
    })
    expect(api.attachProductStation).not.toHaveBeenCalled()
  })

  it('avisa cuando la receta cambió bajo lo ya guardado, sin repararlo solo', async () => {
    api.getStationSuggestion.mockResolvedValue(
      suggestion({
        stations: [
          {
            station_id: 'st1',
            station_name: 'Parrilla',
            tasks: [{ label: 'Carne', ingredient_id: 'i1', amounts: ['150 g'] }],
            from_variants: ['Grande'],
            missing_from_saved: ['Tocineta'],
            saved_no_longer_implied: ['Emplatar'],
          },
        ],
      }),
    )
    seed([
      mapping({
        kitchen_station_id: 'st1',
        tasks: [
          { label: 'Carne', ingredient_id: 'i1' },
          { label: 'Emplatar', ingredient_id: null },
        ],
      }),
    ])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    const drift = wrapper.find('[data-station-drift]')
    expect(drift.text()).toContain('Tocineta')
    expect(drift.text()).toContain('Emplatar')
    expect(api.updateProductStation).not.toHaveBeenCalled()
  })

  it('sin deriva no hay aviso', async () => {
    seed([
      mapping({
        kitchen_station_id: 'st1',
        tasks: [
          { label: 'Carne', ingredient_id: 'i1' },
          { label: 'Fundir queso', ingredient_id: 'i2' },
        ],
      }),
    ])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-station-drift]').exists()).toBe(false)
  })

  it('nombra los insumos que no aportan a ninguna estación', async () => {
    api.getStationSuggestion.mockResolvedValue(
      suggestion({
        unassigned_ingredients: [
          { ingredient_id: 'i1', name: 'Sal', default_station_in_other_branch: false },
          { ingredient_id: 'i2', name: 'Queso', default_station_in_other_branch: true },
        ],
      }),
    )
    seed([])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    const box = wrapper.find('[data-unassigned-ingredients]')
    expect(box.text()).toContain('Sal')
    expect(box.text()).toContain('otra sede')
  })

  it('un plato sin receta lo dice, y deja asignar a mano', async () => {
    api.getStationSuggestion.mockResolvedValue({ stations: [], unassigned_ingredients: [] })
    seed([])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-derive-stations]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-nothing-derive]').text()).toContain('no tiene receta')
    expect(wrapper.find('[data-station-picker]').exists()).toBe(true)
  })
})

describe('sin permiso de configurar cocina', () => {
  // Mapear un plato a una estación es configurar la COCINA, no editar la carta: alguien puede
  // tener `menu.manage` sin `kitchen.update`.
  beforeEach(() => authMock.can.mockImplementation((c) => c !== 'kitchen.update'))

  it('se ve dónde se prepara, pero no se cambia', async () => {
    seed([mapping({ role: 'Carne y armado' })])
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).toContain('Parrilla')
    expect(wrapper.text()).toContain('Carne y armado')
    expect(wrapper.find('[data-attach-station]').exists()).toBe(false)
    expect(wrapper.find('[data-station-tasks]').exists()).toBe(false)
    expect(wrapper.find('[data-detach-station]').exists()).toBe(false)
    expect(wrapper.find('[data-station-role]').exists()).toBe(false)
  })

  it('el aviso de "sin estación" sigue visible: es información, no una acción', async () => {
    seed([])
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.find('[data-no-station]').exists()).toBe(true)
    // Pero no le dice que la asigne: no puede.
    expect(wrapper.find('[data-no-station]').text()).not.toContain('Asígnale')
  })
})

describe('sin estaciones creadas en la sede', () => {
  it('lo dice, en vez de mostrar un desplegable vacío que parece roto', async () => {
    const kitchen = seed([])
    kitchen.stations = []
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).toContain('no tiene estaciones de cocina creadas')
    expect(wrapper.find('[data-station-picker]').exists()).toBe(false)
  })
})
