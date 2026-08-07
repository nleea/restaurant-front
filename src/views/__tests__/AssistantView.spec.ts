// El chat del panel.
//
// Lo que se prueba no es que conteste, sino que **los tres "no" se distingan**: esperar un
// minuto, comprar más saldo y "esto no está contratado" llevan a tres acciones distintas, y
// un único "algo salió mal" las convierte en una llamada al soporte.
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

const branchMock = vi.hoisted(() => ({ listBranches: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/branch.api', () => branchMock)

vi.mock('@/components/AppShell.vue', () => ({
  default: { name: 'AppShell', template: '<div><slot /></div>' },
}))

import AssistantView from '../AssistantView.vue'
import { useAuthStore } from '@/stores/auth'

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
  provider_cost: '0.01',
  ...over,
})

/** Un error del backend tal y como llega: con su `code`, que es lo que distingue el motivo. */
const refusal = (code: string, status = 429) => ({ response: { status, data: { code } } })

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

function mountView() {
  return mount(AssistantView, { global: { stubs } })
}

describe('AssistantView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    branchMock.listBranches.mockResolvedValue([
      { id: 'b1', code: 'centro', name: 'Centro', is_primary: true },
    ])
    apiMock.getUsage.mockResolvedValue(usage())
    const auth = useAuthStore()
    auth.permissions = ['assistant.use', 'assistant.manage']
  })

  it('dice que sólo consulta antes de que nadie pregunte', async () => {
    const view = mountView()
    await flushPromises()
    expect(view.text()).toContain('sólo consulta')
  })

  it('muestra la respuesta y lo que costó', async () => {
    apiMock.ask.mockResolvedValue({
      text: 'Quedan 2 kg de azúcar.',
      model: 'x',
      tokens_in: 10,
      tokens_out: 5,
      billed_units: 1,
    })
    const view = mountView()
    await flushPromises()

    await view.get('[data-test="question"]').setValue('¿qué se está acabando?')
    await view.get('form').trigger('submit')
    await flushPromises()

    expect(view.text()).toContain('Quedan 2 kg de azúcar.')
    expect(view.text()).toContain('1 unidad')
  })

  it('distingue el límite por minuto de la cuota agotada', async () => {
    apiMock.ask.mockRejectedValueOnce(refusal('assistant_rate_limited'))
    const view = mountView()
    await flushPromises()

    await view.get('[data-test="question"]').setValue('hola')
    await view.get('form').trigger('submit')
    await flushPromises()
    // Reintentar SIRVE: eso es lo que hay que decirle a quien está delante.
    expect(view.get('[data-test="refusal"]').text()).toContain('vuelve a intentarlo')

    apiMock.ask.mockRejectedValueOnce(refusal('assistant_quota_exhausted', 402))
    await view.get('[data-test="question"]').setValue('hola otra vez')
    await view.get('form').trigger('submit')
    await flushPromises()
    // Reintentar NO sirve: hay que comprar más, y se dice dónde.
    const text = view.get('[data-test="refusal"]').text()
    expect(text).toContain('agotó el saldo')
    expect(text).toContain('Consumo')
  })

  it('sin derecho se explica en vez de parecer una avería', async () => {
    apiMock.getUsage.mockResolvedValue(usage({ entitled: false, is_enabled: false }))
    const view = mountView()
    await flushPromises()

    expect(view.text()).toContain('no está activo para este negocio')
    expect(view.find('[data-test="question"]').exists()).toBe(false)
  })

  it('a quien no administra no se le manda a una pantalla que no puede abrir', async () => {
    const auth = useAuthStore()
    auth.permissions = ['assistant.use']
    apiMock.ask.mockRejectedValueOnce(refusal('assistant_quota_exhausted', 402))

    const view = mountView()
    await flushPromises()
    await view.get('[data-test="question"]').setValue('hola')
    await view.get('form').trigger('submit')
    await flushPromises()

    const text = view.get('[data-test="refusal"]').text()
    expect(text).toContain('Avísale a quien administra')
    expect(text).not.toContain('Consumo')
  })
})
