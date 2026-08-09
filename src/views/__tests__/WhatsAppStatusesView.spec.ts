// La pantalla de estados. Tres propiedades que el spec exige y que se rompen en silencio:
//
// 1. **La vista previa pinta el color y la fuente REALES.** Son los dos únicos parámetros que el
//    proveedor exige, así que son las dos únicas cosas que una previa podría equivocar.
// 2. **La audiencia se itemiza.** Una cifra sola se lee como cobertura completa de los contactos
//    del negocio, y no lo es.
// 3. **En ningún sitio se dice "visto por".** No se puede saber, así que sería mentira.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WhatsAppStatusesView from '@/views/WhatsAppStatusesView.vue'
import type {
  AudiencePreview,
  StatusPublication,
  WhatsAppStatus,
} from '@/services/messaging.api'

vi.mock('@/components/AppShell.vue', () => ({
  default: { name: 'AppShell', template: '<div><slot /></div>' },
}))

type Mocked = (...args: unknown[]) => Promise<unknown>

const listStatuses = vi.fn<Mocked>()
const previewStatusAudience = vi.fn<Mocked>()
const listStatusPublications = vi.fn<Mocked>()
const createStatus = vi.fn<Mocked>()
const updateStatus = vi.fn<Mocked>()
const deleteStatus = vi.fn<Mocked>()

vi.mock('@/services/messaging.api', () => ({
  listStatuses: (...a: unknown[]) => listStatuses(...a),
  previewStatusAudience: (...a: unknown[]) => previewStatusAudience(...a),
  listStatusPublications: (...a: unknown[]) => listStatusPublications(...a),
  createStatus: (...a: unknown[]) => createStatus(...a),
  updateStatus: (...a: unknown[]) => updateStatus(...a),
  deleteStatus: (...a: unknown[]) => deleteStatus(...a),
  uploadStatusImage: vi.fn<Mocked>(),
}))

vi.mock('@/stores/branch', () => ({
  useBranchStore: () => ({ activeBranchId: 'b1' }),
}))

function status(over: Partial<WhatsAppStatus> = {}): WhatsAppStatus {
  return {
    id: 's1',
    branch_id: 'b1',
    type: 'text',
    content: 'Hoy hay sancocho',
    slots: [{ minute: 660, weekday: 0, on_date: null }],
    bg_color: '#0B3D2E',
    font: 2,
    caption: null,
    media_url: null,
    active: true,
    created_at: '2026-08-09T12:00:00Z',
    updated_at: '2026-08-09T12:00:00Z',
    ...over,
  }
}

function audience(over: Partial<AudiencePreview> = {}): AudiencePreview {
  return {
    addressed: 200,
    total_candidates: 340,
    excluded_no_number: 12,
    excluded_opted_out: 4,
    excluded_inactive: 118,
    excluded_by_cap: 6,
    provider_calls: 20,
    ...over,
  }
}

function publication(over: Partial<StatusPublication> = {}): StatusPublication {
  return {
    id: 'p1',
    fired_for_date: '2026-08-10',
    minute: 660,
    state: 'published',
    addressed_count: 200,
    excluded_no_number: 12,
    excluded_opted_out: 4,
    excluded_inactive: 118,
    excluded_by_cap: 6,
    late_by_minutes: 0,
    created_at: '2026-08-10T16:00:00Z',
    ...over,
  }
}

async function render(
  statuses: WhatsAppStatus[] = [status()],
  preview: AudiencePreview = audience(),
) {
  listStatuses.mockResolvedValue(statuses)
  previewStatusAudience.mockResolvedValue(preview)

  const wrapper = mount(WhatsAppStatusesView)
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Cargando'))
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  // Por defecto sin historial. Cada prueba que quiera uno lo pone ANTES de `render`, y `render` ya
  // no lo pisa — que es lo que dejaba el historial vacío siempre.
  listStatusPublications.mockResolvedValue([])
})

describe('la vista previa es la tarjeta', () => {
  it('pinta el color de fondo que se va a enviar', async () => {
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    const card = wrapper.get('[data-testid="status-preview-card"]')
    expect(card.attributes('data-bg')).toBe('#0B3D2E')
    expect(card.attributes('style')).toContain('background-color')
  })

  it('cambiar el color repinta la previa', async () => {
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    await wrapper.get('[data-testid="bg-#7C2D12"]').trigger('click')

    expect(wrapper.get('[data-testid="status-preview-card"]').attributes('data-bg')).toBe(
      '#7C2D12',
    )
  })

  it('cambiar la fuente se refleja en la previa', async () => {
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    await wrapper.get('[data-testid="font-1"]').trigger('click')

    expect(wrapper.get('[data-testid="status-preview-card"]').attributes('data-font')).toBe(
      '1',
    )
  })
})

describe('el horario', () => {
  it('"Todos" marca los siete días, y añadirlos crea siete franjas', async () => {
    const wrapper = await render([])
    await wrapper.get('[data-testid="new-status"]').trigger('click')

    await wrapper.get('[data-testid="pick-every-day"]').trigger('click')
    await wrapper.get('[data-testid="add-weekly"]').trigger('click')

    // Siete columnas de la semana con la misma hora dentro.
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      expect(wrapper.find(`[data-testid="slot-${day}-660"]`).exists()).toBe(true)
    }
    expect(wrapper.text()).toContain('Todos los días a las 11:00')
  })

  it('no ofrece ningún selector de recurrencia', async () => {
    // Se comprueba sobre los CONTROLES y no sobre la prosa: marcar los siete días ES "todos los
    // días", así que un modo aparte sería un segundo sitio decidiendo el mismo hecho.
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    const controls = [
      ...wrapper.findAll('select'),
      ...wrapper.findAll('input[type="radio"]'),
    ]
    expect(controls).toHaveLength(0)
    expect(wrapper.text().toLowerCase()).not.toContain('recurrente')
  })

  it('sin franjas avisa de que no va a salir solo', async () => {
    const wrapper = await render([])
    await wrapper.get('[data-testid="new-status"]').trigger('click')

    expect(wrapper.text()).toContain('no va a salir solo')
  })
})

describe('la audiencia', () => {
  it('enseña las cuatro bajas por separado, no sólo el total', async () => {
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    expect(wrapper.get('[data-testid="audience-addressed"]').text()).toBe('200')
    const lines = wrapper.get('[data-testid="audience-lines"]')
    for (const key of ['no_number', 'opted_out', 'inactive', 'cap']) {
      expect(lines.find(`[data-line="${key}"]`).exists()).toBe(true)
    }
  })

  it('anuncia la truncación por el tope', async () => {
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    expect(wrapper.get('[data-testid="audience-truncated"]').text()).toContain('6')
  })

  it('sin truncación no inventa el aviso', async () => {
    const wrapper = await render([status()], audience({ excluded_by_cap: 0 }))
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    expect(wrapper.find('[data-testid="audience-truncated"]').exists()).toBe(false)
  })

  it('una audiencia vacía se explica en vez de enseñar un cero', async () => {
    const wrapper = await render(
      [status()],
      audience({
        addressed: 0,
        total_candidates: 0,
        excluded_no_number: 0,
        excluded_opted_out: 0,
        excluded_inactive: 0,
        excluded_by_cap: 0,
      }),
    )
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    expect(wrapper.get('[data-testid="audience-empty-reason"]').text()).toContain(
      'nadie le ha escrito',
    )
  })
})

describe('el historial', () => {
  it('dice "enviado a", nunca "visto por"', async () => {
    listStatusPublications.mockResolvedValue([publication()])
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="publication-log"]').exists()).toBe(true),
    )

    const log = wrapper.get('[data-testid="publication-log"]').text()
    expect(log).toContain('enviado a 200 contactos')
    for (const forbidden of ['visto', 'entregado', 'leído']) {
      expect(log.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('distingue los cuatro finales, y los dos omitidos entre sí', async () => {
    listStatusPublications.mockResolvedValue([
      publication({ id: 'p1', state: 'published' }),
      publication({ id: 'p2', state: 'failed', addressed_count: 0 }),
      publication({
        id: 'p3',
        state: 'skipped_late',
        addressed_count: 0,
        late_by_minutes: 160,
      }),
      publication({ id: 'p4', state: 'skipped_empty', addressed_count: 0 }),
    ])
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="publication-log"]').exists()).toBe(true),
    )

    const log = wrapper.get('[data-testid="publication-log"]')
    expect(log.findAll('li')).toHaveLength(4)
    expect(log.text()).toContain('Publicado')
    expect(log.text()).toContain('Falló')
    expect(log.text()).toContain('se pasó la hora')
    expect(log.text()).toContain('sin audiencia')
    // El retraso, para que "omitido" no sea un silencio con fila.
    expect(log.text()).toContain('160 min tarde')
  })
})

describe('guardar', () => {
  it('un texto sin color no se puede guardar, y lo dice', async () => {
    const wrapper = await render([status({ bg_color: null })])
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    expect(wrapper.get('[data-testid="draft-errors"]').text()).toContain('color')
    expect(
      wrapper.get('[data-testid="save-status"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('una tarjeta completa se guarda', async () => {
    createStatus.mockResolvedValue(status({ id: 's2' }))
    listStatuses.mockResolvedValue([status(), status({ id: 's2' })])
    const wrapper = await render()
    await wrapper.get('[data-testid="status-row-s1"]').trigger('click')

    await wrapper.get('[data-testid="save-status"]').trigger('click')

    expect(updateStatus).toHaveBeenCalledWith(
      'b1',
      's1',
      expect.objectContaining({ type: 'text', bg_color: '#0B3D2E', font: 2 }),
    )
  })
})
