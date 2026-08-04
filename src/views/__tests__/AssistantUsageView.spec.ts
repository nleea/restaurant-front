// La pantalla de consumo.
//
// Su trabajo por encima de los demás es que **pasarse del umbral sea imposible de no ver**.
// Un porcentaje más entre porcentajes no avisa a nadie: el estado tiene que cambiar la barra
// y decir qué va a pasar cuando se acabe, no sólo cuánto queda.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  ask: vi.fn<(...a: unknown[]) => unknown>(),
  getUsage: vi.fn<(...a: unknown[]) => unknown>(),
  listRecentUsage: vi.fn<(...a: unknown[]) => unknown>(),
  listPlans: vi.fn<(...a: unknown[]) => unknown>(),
  saveEntitlement: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/assistant.api', () => apiMock)

vi.mock('@/components/AppShell.vue', () => ({
  default: { name: 'AppShell', template: '<div><slot /></div>' },
}))

import AssistantUsageView from '../AssistantUsageView.vue'

const usage = (over: Record<string, unknown> = {}) => ({
  entitled: true,
  is_enabled: true,
  plan: 'basic',
  quota_units: 100,
  used_units: 10,
  remaining_units: 90,
  used_percent: 10,
  exhausted: false,
  warning_threshold_percent: 80,
  period_start: null,
  period_end: null,
  provider_cost: '0.0123',
  ...over,
})

describe('AssistantUsageView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.getUsage.mockResolvedValue(usage())
    apiMock.listRecentUsage.mockResolvedValue([])
    apiMock.listPlans.mockResolvedValue([
      { name: 'basic', max_input_tokens: 2000, max_output_tokens: 400 },
    ])
  })

  it('el estado normal no grita', async () => {
    const view = mount(AssistantUsageView)
    await flushPromises()

    expect(view.get('[data-test="meter"]').attributes('data-level')).toBe('ok')
    expect(view.find('[data-test="warning"]').exists()).toBe(false)
  })

  it('pasado el umbral lo dice con lo que queda, no con un porcentaje suelto', async () => {
    apiMock.getUsage.mockResolvedValue(
      usage({ used_units: 85, remaining_units: 15, used_percent: 85 }),
    )
    const view = mount(AssistantUsageView)
    await flushPromises()

    expect(view.get('[data-test="meter"]').attributes('data-level')).toBe('warning')
    expect(view.get('[data-test="warning"]').text()).toContain('15 respuestas')
  })

  it('agotado explica que hay un mensaje fijo y que la gente sigue pudiendo atender', async () => {
    apiMock.getUsage.mockResolvedValue(
      usage({ used_units: 100, remaining_units: 0, used_percent: 100, exhausted: true }),
    )
    const view = mount(AssistantUsageView)
    await flushPromises()

    const text = view.get('[data-test="exhausted"]').text()
    expect(view.get('[data-test="meter"]').attributes('data-level')).toBe('exhausted')
    expect(text).toContain('no se llama al modelo')
    expect(text).toContain('inbox')
  })

  it('no deja encenderlo sin unidades', async () => {
    apiMock.getUsage.mockResolvedValue(usage({ quota_units: 0, is_enabled: false }))
    const view = mount(AssistantUsageView)
    await flushPromises()

    const toggle = view.get('input[type="checkbox"]')
    expect(toggle.attributes('disabled')).toBeDefined()
    expect(view.text()).toContain('con cero contestaría')
  })

  it('sin derecho se explica en vez de enseñar una barra vacía', async () => {
    apiMock.getUsage.mockResolvedValue(usage({ entitled: false }))
    const view = mount(AssistantUsageView)
    await flushPromises()

    expect(view.find('[data-test="meter"]').exists()).toBe(false)
    expect(view.text()).toContain('no está contratado')
  })

  it('el error del backend se enseña tal cual: es la frase que explica el fallo', async () => {
    apiMock.saveEntitlement.mockRejectedValue({
      response: { status: 422, data: { detail: 'No se puede encender el asistente sin unidades' } },
    })
    const view = mount(AssistantUsageView)
    await flushPromises()

    await view.get('[data-test="quota"]').setValue(10)
    await view.get('button').trigger('click')
    await flushPromises()

    expect(view.get('[data-test="form-error"]').text()).toContain('sin unidades')
  })
})
