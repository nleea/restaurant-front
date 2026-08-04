// A quién se le avisa por WhatsApp.
//
// La propiedad que se prueba es la separación: **ver el panel de alertas y que le suene el
// móvil a las once de la noche son cosas distintas.** Antes estaban atadas al mismo permiso,
// así que quien debía ver la pantalla pero no recibir mensajes no tenía salida.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const staffApi = vi.hoisted(() => ({
  listEmployees: vi.fn<(...a: unknown[]) => unknown>(),
  setAlertSubscription: vi.fn<(...a: unknown[]) => unknown>(),
  setEmployeePhone: vi.fn<(...a: unknown[]) => unknown>(),
  updateEmployeeRole: vi.fn<(...a: unknown[]) => unknown>(),
  listShifts: vi.fn<(...a: unknown[]) => unknown>(),
  setEmployeeActive: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/staff.api', () => staffApi)

const alertsApi = vi.hoisted(() => ({
  getEscalationRecipients: vi.fn<(...a: unknown[]) => unknown>(),
  getContactableChats: vi.fn<(...a: unknown[]) => unknown>(),
  linkRecipientChat: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/alerts.api', () => alertsApi)

vi.mock('@/components/staff/RoleSelector.vue', () => ({
  default: { name: 'RoleSelector', template: '<div />' },
}))
vi.mock('@/components/staff/ShiftCalendar.vue', () => ({
  default: { name: 'ShiftCalendar', template: '<div />' },
}))
vi.mock('@/components/staff/AddShiftModal.vue', () => ({
  default: { name: 'AddShiftModal', template: '<div />' },
}))

import EmployeeDetailPanel from '../EmployeeDetailPanel.vue'

const employee = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  branch_id: 'b1',
  person_id: 'p1',
  user_id: 'u1',
  role_id: 'r1',
  hired_at: null,
  is_active: true,
  phone: '573001112233',
  receives_alerts: false,
  whatsapp_contact_id: null,
  ...over,
})

async function mountPanel(over: Record<string, unknown> = {}, canManage = true) {
  const wrapper = mount(EmployeeDetailPanel, {
    props: { employee: employee(over), canManage },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  staffApi.listShifts.mockResolvedValue([])
  staffApi.listEmployees.mockResolvedValue([])
  alertsApi.getEscalationRecipients.mockResolvedValue([])
  alertsApi.getContactableChats.mockResolvedValue([])
  alertsApi.linkRecipientChat.mockResolvedValue({
    employee_id: 'e1',
    name: 'Ana',
    has_chat: true,
    reachable: true,
  })
})

describe('el interruptor de alertas por WhatsApp', () => {
  it('nace apagado: nadie recibe nada hasta que se le señale', async () => {
    const wrapper = await mountPanel()
    const toggle = wrapper.get('[data-testid="alert-subscription"]')
    expect(toggle.attributes('aria-checked')).toBe('false')
  })

  it('encenderlo señala a esa persona', async () => {
    staffApi.setAlertSubscription.mockResolvedValue(employee({ receives_alerts: true }))
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="alert-subscription"]').trigger('click')
    await flushPromises()

    expect(staffApi.setAlertSubscription).toHaveBeenCalledWith('e1', true)
  })

  it('apagarlo no le quita el panel: dice justo eso', async () => {
    const wrapper = await mountPanel()
    // Es la razón de existir del interruptor, así que se dice en la pantalla.
    expect(wrapper.text()).toContain('Seguirá viendo el panel igual si lo apagas')
  })

  it('avisa cuando falta emparejar el chat', async () => {
    alertsApi.getEscalationRecipients.mockResolvedValue([
      { employee_id: 'e1', name: 'Ana', has_chat: false, reachable: false },
    ])
    const wrapper = await mountPanel({ receives_alerts: true })

    expect(wrapper.get('[data-testid="alert-reachability"]').text()).toContain(
      'Falta emparejar su chat',
    )
  })

  it('confirma cuando sí le llegaría', async () => {
    alertsApi.getEscalationRecipients.mockResolvedValue([
      { employee_id: 'e1', name: 'Ana', has_chat: true, reachable: true },
    ])
    const wrapper = await mountPanel({ receives_alerts: true })

    expect(wrapper.get('[data-testid="alert-reachability"]').text()).toContain(
      'se le puede escribir',
    )
  })

  it('ofrece los chats que ya escribieron, no un campo de teléfono', async () => {
    // Deducirlo del teléfono es imposible con un `@lid`; que el chat exista ES la prueba.
    alertsApi.getContactableChats.mockResolvedValue([
      { contact_id: 'c1', name: 'Nelson', address: '196125537607835@lid' },
      { contact_id: 'c2', name: null, address: '573001112233' },
    ])
    const wrapper = await mountPanel({ receives_alerts: true })

    const options = wrapper.get('[data-testid="chat-picker"]').findAll('option')
    expect(options).toHaveLength(3) // "sin emparejar" + los dos chats
    expect(wrapper.get('[data-testid="chat-picker"]').text()).toContain('Nelson')
    // Un `@lid` se ofrece igual: es la dirección con la que se le escribe.
    expect(wrapper.get('[data-testid="chat-picker"]').text()).toContain('@lid')
  })

  it('elegir un chat lo empareja', async () => {
    alertsApi.getContactableChats.mockResolvedValue([
      { contact_id: 'c1', name: 'Nelson', address: '196125537607835@lid' },
    ])
    const wrapper = await mountPanel({ receives_alerts: true })

    await wrapper.get('[data-testid="chat-picker"]').setValue('c1')
    await flushPromises()

    expect(alertsApi.linkRecipientChat).toHaveBeenCalledWith('b1', 'e1', 'c1')
  })

  it('sin chats disponibles dice qué hacer, en vez de un desplegable vacío', async () => {
    const wrapper = await mountPanel({ receives_alerts: true })
    expect(wrapper.get('[data-testid="no-chats"]').text()).toContain('mande un "hola"')
  })

  it('"sin emparejar" desempareja en vez de no hacer nada', async () => {
    alertsApi.getContactableChats.mockResolvedValue([
      { contact_id: 'c1', name: 'Nelson', address: '1@lid' },
    ])
    const wrapper = await mountPanel({ receives_alerts: true, whatsapp_contact_id: 'c1' })

    await wrapper.get('[data-testid="chat-picker"]').setValue('')
    await flushPromises()

    expect(alertsApi.linkRecipientChat).toHaveBeenCalledWith('b1', 'e1', null)
  })

  it('no dice nada del alcance si la persona no está señalada', async () => {
    alertsApi.getEscalationRecipients.mockResolvedValue([])
    const wrapper = await mountPanel({ receives_alerts: false })
    // Sin señalar, hablar de contactabilidad sería ruido.
    expect(wrapper.find('[data-testid="alert-reachability"]').exists()).toBe(false)
  })

  it('sin permiso de gestión el interruptor no se toca', async () => {
    const wrapper = await mountPanel({}, false)
    expect(
      wrapper.get('[data-testid="alert-subscription"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('un 403 al pedir el detalle no rompe la ficha', async () => {
    // Quien gestiona personal puede no tener `alerts.read`; la ficha tiene que seguir viva.
    alertsApi.getEscalationRecipients.mockRejectedValue({ response: { status: 403 } })
    const wrapper = await mountPanel({ receives_alerts: true })

    expect(wrapper.find('[data-testid="alert-subscription"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="alert-reachability"]').exists()).toBe(false)
  })
})
