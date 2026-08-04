// El indicador del riel.
//
// Es la pieza que hace que este módulo AVISE en vez de haber que consultarlo: quien está en
// Caja o en Cocina tiene que enterarse de que falta tomate sin abrir nada. Por eso vive en
// el riel —que está siempre— y no en la pantalla de alertas.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/cash' }),
  useRouter: () => ({ replace: vi.fn<(...a: unknown[]) => unknown>() }),
}))

vi.mock('@/components/BranchSelector.vue', () => ({
  default: { name: 'BranchSelector', template: '<div />' },
}))

const alertsApi = vi.hoisted(() => ({
  listAlerts: vi.fn<(...a: unknown[]) => unknown>(),
  acknowledgeAlert: vi.fn<(...a: unknown[]) => unknown>(),
  listRules: vi.fn<(...a: unknown[]) => unknown>(),
  saveRule: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/alerts.api', () => alertsApi)

const liveMock = vi.hoisted(() => ({ start: vi.fn<() => void>(), stop: vi.fn<() => void>() }))
vi.mock('@/composables/useLiveRefetch', () => ({
  createLiveRefetch: vi.fn<(...a: unknown[]) => unknown>(() => liveMock),
}))

import AppSidebar from '../AppSidebar.vue'
import { useAlertsStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'

const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  rule_key: 'low_stock',
  subject_ref: 'ing-tomate',
  status: 'fired',
  fired_at: new Date().toISOString(),
  acknowledged_at: null,
  acknowledged_by: null,
  holder_name: null,
  last_escalated_at: null, reminders_muted_at: null,
  ...over,
})

async function mountRail(permissions: string[]) {
  useAuthStore().permissions = permissions
  const branch = useBranchStore()
  branch.branches = [{ id: 'b1', code: 'CENTRO', name: 'Sede Centro', is_primary: true }]
  branch.activeBranchId = 'b1'
  const wrapper = mount(AppSidebar, {
    props: { open: true },
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  alertsApi.listAlerts.mockResolvedValue([])
})

describe('el indicador de alertas', () => {
  it('aparece cuando algo se enciende', async () => {
    alertsApi.listAlerts.mockResolvedValue([alert({ id: 'a1' }), alert({ id: 'a2' })])

    const wrapper = await mountRail(['alerts.read'])

    expect(wrapper.get('[data-testid="alerts-badge"]').text()).toBe('2')
  })

  it('no hay número cuando no hay nada que atender', async () => {
    const wrapper = await mountRail(['alerts.read'])
    // Un "0" permanente es ruido visual: la ausencia ya dice que todo está bien.
    expect(wrapper.find('[data-testid="alerts-badge"]').exists()).toBe(false)
  })

  it('se apaga al TOMAR la alerta, no al mirarla', async () => {
    alertsApi.listAlerts.mockResolvedValue([alert()])
    alertsApi.acknowledgeAlert.mockResolvedValue(
      alert({ status: 'acknowledged', holder_name: 'Ana' }),
    )
    const wrapper = await mountRail(['alerts.read'])
    expect(wrapper.get('[data-testid="alerts-badge"]').text()).toBe('1')

    await useAlertsStore().acknowledge('a1')
    await flushPromises()

    // Un contador que se apaga por abrir la pantalla no dice nada: lo que importa es que
    // alguien se haya hecho cargo.
    expect(wrapper.find('[data-testid="alerts-badge"]').exists()).toBe(false)
  })

  it('no cuenta lo que ya tiene dueño', async () => {
    alertsApi.listAlerts.mockResolvedValue([
      alert({ id: 'a1' }),
      alert({ id: 'a2', status: 'acknowledged', holder_name: 'Ana' }),
    ])
    const wrapper = await mountRail(['alerts.read'])
    expect(wrapper.get('[data-testid="alerts-badge"]').text()).toBe('1')
  })

  it('sin permiso no se pide nada ni se muestra el enlace', async () => {
    const wrapper = await mountRail(['cash.read'])

    expect(alertsApi.listAlerts).not.toHaveBeenCalled()
    expect(wrapper.html()).not.toContain('/alerts')
  })

  it('el riel es quien mantiene viva la suscripción', async () => {
    await mountRail(['alerts.read'])
    // Si la suscripción viviera en la vista, alguien en Caja no se enteraría de nada — que
    // es exactamente lo que este módulo existe para evitar.
    expect(liveMock.start).toHaveBeenCalled()
  })
})
