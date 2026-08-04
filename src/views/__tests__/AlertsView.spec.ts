// El panel.
//
// La pantalla que más se va a ver es la VACÍA, así que es la que más importa que se lea
// bien: "todo en orden" tiene que ser una respuesta con cara, no una lista sin filas.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listAlerts: vi.fn<(...a: unknown[]) => unknown>(),
  acknowledgeAlert: vi.fn<(...a: unknown[]) => unknown>(),
  muteAlert: vi.fn<(...a: unknown[]) => unknown>(),
  listRules: vi.fn<(...a: unknown[]) => unknown>(),
  saveRule: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/alerts.api', () => apiMock)

const branchMock = vi.hoisted(() => ({ listBranches: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/branch.api', () => branchMock)

vi.mock('@/composables/useLiveRefetch', () => ({
  createLiveRefetch: vi.fn<(...a: unknown[]) => unknown>(() => ({
    start: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
  })),
}))

vi.mock('@/components/AppShell.vue', () => ({
  default: { name: 'AppShell', template: '<div><slot /></div>' },
}))

import AlertsView from '../AlertsView.vue'
import { useAuthStore } from '@/stores/auth'
import { useAlertsStore } from '@/stores/alerts'

class FakeNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => 'granted')
  static instances: { title: string }[] = []
  onclick: (() => void) | null = null
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push({ title })
  }
  close = vi.fn<() => void>()
}

const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  rule_key: 'low_stock',
  subject_ref: 'ing-tomate',
  subject_label: 'Tomate',
  status: 'fired',
  fired_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  acknowledged_at: null,
  acknowledged_by: null,
  holder_name: null,
  last_escalated_at: null,
  reminders_muted_at: null,
  ...over,
})

async function mountView() {
  const wrapper = mount(AlertsView, {
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
  document.title = 'El Pase'
  FakeNotification.permission = 'default'
  FakeNotification.instances = []
  FakeNotification.requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => 'granted')
  vi.stubGlobal('Notification', FakeNotification)
  apiMock.listAlerts.mockResolvedValue([])
  branchMock.listBranches.mockResolvedValue([
    { id: 'b1', code: 'CENTRO', name: 'Sede Centro', is_primary: true },
  ])
})

describe('AlertsView', () => {
  it('trata "todo en orden" como una respuesta, no como una lista vacía', async () => {
    const wrapper = await mountView()
    const empty = wrapper.get('[data-testid="all-clear"]')
    expect(empty.text()).toContain('Todo en orden')
    // Y explica que no hace falta quedarse mirando.
    expect(empty.text()).toContain('aparece aquí solo')
  })

  it('pide sólo las alertas de la sucursal activa', async () => {
    await mountView()
    expect(apiMock.listAlerts).toHaveBeenCalledWith('b1')
  })

  it('lista lo que está encendido', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    const wrapper = await mountView()
    expect(wrapper.findAll('[data-alert]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="all-clear"]').exists()).toBe(false)
  })

  it('llama a las cosas por su nombre, no por su id', async () => {
    // Antes el panel pintaba el `subject_ref` crudo: un uuid donde debía decir "Azúcar".
    apiMock.listAlerts.mockResolvedValue([
      alert({ subject_ref: '5d46e088-ee6a-4b88-93e1-64864dd6f8e1', subject_label: 'Azúcar' }),
    ])
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Azúcar')
    expect(wrapper.text()).not.toContain('5d46e088')
  })

  it('una alerta vieja sin nombre cae en la referencia, no en un hueco', async () => {
    apiMock.listAlerts.mockResolvedValue([alert({ subject_label: null })])
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('ing-tomate')
  })

  it('pone primero lo que nadie ha tomado', async () => {
    apiMock.listAlerts.mockResolvedValue([
      alert({ id: 'taken', status: 'acknowledged', holder_name: 'Ana' }),
      alert({ id: 'free' }),
    ])
    const wrapper = await mountView()

    // Lo que nadie cogió es lo que hay que mirar; lo tomado ya tiene dueño.
    const ids = wrapper.findAll('[data-alert]').map((n) => n.attributes('data-alert'))
    expect(ids[0]).toBe('free')
  })

  it('tomar una alerta la atribuye en pantalla', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    apiMock.acknowledgeAlert.mockResolvedValue(
      alert({ status: 'acknowledged', holder_name: 'Ana Restrepo' }),
    )
    const wrapper = await mountView()

    await wrapper.get('[data-testid="acknowledge"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="holder"]').text()).toContain('Ana Restrepo')
  })

  it('perder la carrera se explica, no se traga', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    apiMock.acknowledgeAlert.mockRejectedValue({
      response: { status: 409, data: { detail: 'Esta alerta ya la tomó Bruno Díaz.' } },
    })
    const wrapper = await mountView()

    await wrapper.get('[data-testid="acknowledge"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="claim-conflict"]').text()).toContain('Bruno Díaz')
  })

  it('sólo ofrece configurar a quien puede', async () => {
    const wrapper = await mountView()
    expect(wrapper.html()).not.toContain('/alerts/rules')

    useAuthStore().permissions = ['alerts.read', 'alerts.manage']
    await flushPromises()

    expect(wrapper.html()).toContain('/alerts/rules')
  })

  it('un fallo de carga se dice, no se disfraza de "todo en orden"', async () => {
    apiMock.listAlerts.mockRejectedValue(new Error('caído'))
    const wrapper = await mountView()

    // Lo peor que puede hacer esta pantalla es anunciar calma cuando no sabe nada: el
    // usuario se iría tranquilo con el tomate acabándose.
    expect(wrapper.get('[data-testid="error"]').text()).toContain('No se pudieron cargar')
    expect(wrapper.find('[data-testid="all-clear"]').exists()).toBe(false)
  })
})

// --- La diferencia entre "me encargo" y "ya lo sé" ---------------------------
describe('silenciar desde el panel', () => {
  it('explica la diferencia en la pantalla, no en un tooltip', async () => {
    // Se usa en una tablet, con el dedo: un `title` por tarjeta no existe sin ratón.
    apiMock.listAlerts.mockResolvedValue([alert()])
    const text = (await mountView()).get('[data-testid="mute-help"]').text()

    expect(text).toContain('Me encargo')
    expect(text).toContain('Ya lo sé')
    // Lo que hay que desmentir: que apague la regla entera.
    expect(text).toContain('sin apagar la regla')
  })

  it('silenciar llama al endpoint con esa alerta', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    apiMock.muteAlert.mockResolvedValue({ ...alert(), reminders_muted_at: '2026-08-01T18:00:00Z' })
    const wrapper = await mountView()

    await wrapper.get('[data-testid="mute"]').trigger('click')
    await flushPromises()

    expect(apiMock.muteAlert).toHaveBeenCalledWith('b1', alert().id)
  })
})

// --- Avisos fuera de la pestaña -----------------------------------------------
// Durante un servicio nadie tiene esta pantalla abierta. Sin esto, los recordatorios cada cinco
// minutos insisten en un sitio donde no hay nadie mirando.
describe('avisos del navegador', () => {
  it('NO pide permiso al abrir la pantalla', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])

    await mountView()

    // Un `denied` es permanente desde la página: pedirlo al cargar mata la feature para ese
    // dispositivo para siempre, y no hay arreglo desde la app.
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('lo pide al encenderlos, con el gesto delante', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    const wrapper = await mountView()

    await wrapper.get('[data-testid="toggle-notifications"]').trigger('click')
    await flushPromises()

    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce()
  })

  it('las alertas que ya estaban NO se anuncian al entrar', async () => {
    // Entrar al panel con tres alertas de anoche no puede disparar tres notificaciones.
    FakeNotification.permission = 'granted'
    localStorage.setItem('alerts.notifications.enabled', '1')
    apiMock.listAlerts.mockResolvedValue([alert(), alert({ id: 'a2' })])

    await mountView()

    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('una alerta nueva tras un refresco sí se anuncia', async () => {
    FakeNotification.permission = 'granted'
    localStorage.setItem('alerts.notifications.enabled', '1')
    apiMock.listAlerts.mockResolvedValue([alert()])
    const wrapper = await mountView()

    apiMock.listAlerts.mockResolvedValue([alert(), alert({ id: 'a2', subject_label: 'Camarón' })])
    await useAlertsStore().refetch()
    await flushPromises()

    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeNotification.instances[0]!.title).toBe('Camarón')
    wrapper.unmount()
  })

  it('cuenta las sin tomar en el título de la pestaña', async () => {
    apiMock.listAlerts.mockResolvedValue([alert(), alert({ id: 'a2' })])

    await mountView()

    // Es la única señal que no pide permiso a nadie, así que se pinta siempre.
    expect(document.title).toContain('(2)')
  })

  it('dice que hace falta dejar una pestaña abierta', async () => {
    apiMock.listAlerts.mockResolvedValue([])
    const text = (await mountView()).get('[data-testid="notifications-help"]').text()

    // Prometerlo y fallar es peor que no ofrecerlo.
    expect(text).toContain('pestaña')
  })

  it('un permiso bloqueado se explica y manda al navegador, no a la app', async () => {
    FakeNotification.permission = 'denied'
    apiMock.listAlerts.mockResolvedValue([])
    const wrapper = await mountView()

    expect(wrapper.get('[data-testid="notifications-help"]').text()).toContain(
      'ajustes del navegador',
    )
    expect(
      wrapper.get('[data-testid="toggle-notifications"]').attributes('disabled'),
    ).toBeDefined()
  })
})
