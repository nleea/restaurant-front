// La pantalla entera: carga los ajustes vigentes, deja editarlos y —lo que importa— no deja
// guardar un texto con un marcador que no existe. Un mensaje roto no se descubre a las 8pm
// con un cliente esperando.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import type { AutoreplyDefaults, StatusMessage } from '@/services/messaging.api'

const apiMock = vi.hoisted(() => ({
  getAutoreplySettings: vi.fn<(...a: unknown[]) => unknown>(),
  saveAutoreplySettings: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/messaging.api', () => apiMock)

const businessMock = vi.hoisted(() => ({
  getBranchHours: vi.fn<(...a: unknown[]) => unknown>(),
  getBusinessProfile: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/business.api', () => businessMock)

const branchMock = vi.hoisted(() => ({ listBranches: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/branch.api', () => branchMock)

// El AppShell arrastra router y sesión; aquí sólo estorba.
vi.mock('@/components/AppShell.vue', () => ({
  default: { name: 'AppShell', template: '<div><slot /></div>' },
}))

import WhatsAppAutoreplyView from '../WhatsAppAutoreplyView.vue'

const msg = (enabled: boolean, text: string): StatusMessage => ({ enabled, text })

const DEFAULTS: AutoreplyDefaults = {
  settings: {
    greeting_enabled: true,
    greeting_open_text: 'Hola desde {business_name}: {menu_link}',
    greeting_closed_text: 'Cerrados; abrimos {next_opening}',
    greeting_awaiting_payment_text: '',
    assistant_offer_enabled: false,
    faqs: null,
    quick_replies: null,
    idle_hours: 24,
    token_lifetime_hours: 24,
    status_mapping: {},
  },
  default_status_mapping: {
    order_received: msg(true, 'Recibimos {order_number}'),
    ready: msg(false, 'Listo {order_number}'),
    assigned: msg(false, 'Asignado {order_number}'),
    on_the_way: msg(true, 'En camino {order_number}'),
    delivered: msg(true, 'Entregado {order_number}'),
    cancelled: msg(true, 'Cancelado {order_number}'),
  },
  greeting_placeholders: [
    'business_name',
    'branch_name',
    'branch_address',
    'branch_phone',
    'menu_link',
    'next_opening',
  ],
  order_placeholders: [
    'business_name',
    'branch_name',
    'branch_address',
    'branch_phone',
    'order_number',
    'order_total',
  ],
  // Las sugeridas llegan APAGADAS: instalar esto no le enciende respuestas automáticas a nadie.
  suggested_faqs: [
    {
      id: 'faq-location',
      name: 'Ubicación',
      triggers: ['donde estan'],
      text: 'Estamos en {branch_address}.',
      enabled: false,
    },
  ],
  suggested_quick_replies: [
    { id: 'quick-on-the-way', name: 'Va en camino', text: 'Tu pedido ya salió.' },
  ],
  awaiting_payment_placeholders: [
    'business_name',
    'branch_name',
    'menu_link',
    'order_number',
    'order_total',
  ],
  faq_placeholders: [
    'business_name',
    'branch_name',
    'branch_address',
    'branch_phone',
    'menu_link',
    'next_opening',
    'hours_line',
  ],
  assistant_available: false,
}

async function mountView() {
  const wrapper = mount(WhatsAppAutoreplyView)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  apiMock.getAutoreplySettings.mockResolvedValue(structuredClone(DEFAULTS))
  apiMock.saveAutoreplySettings.mockImplementation((s: unknown) => Promise.resolve(s))
  businessMock.getBranchHours.mockResolvedValue([
    { id: 'h1', weekday: 0, openMinute: 480, closeMinute: 1200 },
  ])
  // El Perfil del negocio: de aquí salen el nombre del restaurante y los datos de la sede.
  businessMock.getBusinessProfile.mockResolvedValue({
    tenantId: 't1',
    name: 'Sabor Costeño',
    taxId: null,
    email: null,
    phone: null,
    photoUrl: null,
    bannerUrl: null,
    staffCount: 1,
    branches: [
      {
        id: 'b1',
        name: 'Sede Centro',
        address: 'Cra 5 #12-30',
        phone: '3001112233',
        isPrimary: true,
        hours: [],
      },
    ],
  })
  branchMock.listBranches.mockResolvedValue([
    { id: 'b1', code: 'CENTRO', name: 'Sede Centro', is_primary: true },
  ])
})

describe('WhatsAppAutoreplyView', () => {
  it('materializa el comportamiento VIGENTE, no la fila guardada', async () => {
    // Un tenant sin fila igual manda los avisos de fábrica. Si la pantalla enseñara sólo lo
    // guardado (`{}`), mostraría todo apagado mientras el número escribe.
    const wrapper = await mountView()
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('3')
    expect(wrapper.findAll('[data-transition]')).toHaveLength(6)
  })

  it('arranca sin nada que guardar', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeDefined()
  })

  it('habilita el guardado en cuanto hay un cambio', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="greeting-open"]').setValue('Hola {business_name}')
    expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeUndefined()
  })

  it('un marcador que no existe bloquea el guardado y se nombra', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="greeting-open"]').setValue('Hola {cliente}')

    expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="invalid-hint"]').text()).toContain('{cliente}')

    await wrapper.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    expect(apiMock.saveAutoreplySettings).not.toHaveBeenCalled()
  })

  it('corregirlo vuelve a habilitar el guardado', async () => {
    const wrapper = await mountView()
    const open = wrapper.get('[data-testid="greeting-open"]')
    await open.setValue('Hola {cliente}')
    expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeDefined()

    await open.setValue('Hola {business_name}')
    expect(wrapper.find('[data-testid="invalid-hint"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeUndefined()
  })

  it('guarda las seis transiciones, no sólo lo que el dueño tocó', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="greeting-open"]').setValue('Hola {business_name}')
    await wrapper.get('[data-testid="save"]').trigger('click')
    await flushPromises()

    const sent = apiMock.saveAutoreplySettings.mock.calls[0]?.[0] as {
      status_mapping: Record<string, StatusMessage>
    }
    expect(Object.keys(sent.status_mapping)).toHaveLength(6)
    expect(sent.status_mapping.order_received?.enabled).toBe(true)
  })

  it('repite el mensaje del backend cuando el guardado se cae', async () => {
    // El 422 del servidor nombra al culpable; repetirlo es más útil que un "no se pudo".
    apiMock.saveAutoreplySettings.mockRejectedValue({
      response: { status: 422, data: { detail: 'Marcadores no válidos en el saludo: {cliente}.' } },
    })
    const wrapper = await mountView()
    await wrapper.get('[data-testid="greeting-open"]').setValue('Hola {business_name}')
    await wrapper.get('[data-testid="save"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="save-error"]').text()).toContain('{cliente}')
  })

  it('la oferta del asistente llega deshabilitada mientras no exista', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('[data-testid="assistant-toggle"]').attributes('disabled')).toBeDefined()
  })

  it('la vista previa saluda con el nombre del Perfil del negocio', async () => {
    // El fallo original: decía "Main Branch" —el nombre que la semilla le puso a la
    // sucursal— con el perfil ya relleno.
    const wrapper = await mountView()
    expect(wrapper.get('[data-testid="preview-open"]').text()).toContain('Sabor Costeño')
  })

  it('la vista previa usa el enlace y los horarios de la sede', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('[data-testid="preview-open"]').text()).toContain('store/CENTRO')
    // Con horarios cargados, la variante de cerrado resuelve el marcador.
    expect(wrapper.get('[data-testid="preview-closed"]').text()).not.toContain('{next_opening}')
  })

  it('restaurar deja el mapeo de fábrica', async () => {
    const wrapper = await mountView()
    const ready = wrapper.get('[data-transition="ready"]')
    await ready.get('button[role="switch"]').trigger('click')
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('4')

    await wrapper.get('[data-testid="restore-mapping"]').trigger('click')
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('3')
  })

  // --- FAQs ------------------------------------------------------------------
  it('un tenant que nunca las tocó ve las sugeridas, apagadas', async () => {
    // `faqs: null` en el cable. Que lleguen APAGADAS es lo que hace que instalar esto no le
    // cambie el canal a nadie sin que lo pida.
    const wrapper = await mountView()
    expect(wrapper.get('[data-testid="faq-position-faq-location"]').text()).toBe('1')
    expect(
      wrapper.get('[data-testid="faq-toggle-faq-location"]').attributes('aria-checked'),
    ).toBe('false')
    expect(wrapper.get('[data-testid="faq-count"]').text()).toContain('0')
  })

  it('encender una FAQ deja cambios sin guardar y las manda como lista', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="faq-toggle-faq-location"]').trigger('click')
    expect(wrapper.text()).toContain('Hay cambios sin guardar')

    await wrapper.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    const sent = apiMock.saveAutoreplySettings.mock.calls[0]?.[0] as {
      faqs: { id: string; enabled: boolean }[]
    }
    expect(sent.faqs[0]).toMatchObject({ id: 'faq-location', enabled: true })
  })

  it('borrarlas todas se guarda como [] y no como "nunca las tocó"', async () => {
    // La distinción que impide que una FAQ borrada resucite en la siguiente carga.
    const wrapper = await mountView()
    await wrapper.get('[data-testid="faq-header-faq-location"]').trigger('click')
    await wrapper.get('[data-testid="faq-delete-faq-location"]').trigger('click')
    await wrapper.get('[data-testid="faq-delete-confirm-faq-location"]').trigger('click')

    await wrapper.get('[data-testid="save"]').trigger('click')
    await flushPromises()
    const sent = apiMock.saveAutoreplySettings.mock.calls[0]?.[0] as { faqs: unknown[] }
    expect(sent.faqs).toEqual([])
  })

  it('restaurar sugeridas vuelve a poner la lista de fábrica', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="faq-header-faq-location"]').trigger('click')
    await wrapper.get('[data-testid="faq-delete-faq-location"]').trigger('click')
    await wrapper.get('[data-testid="faq-delete-confirm-faq-location"]').trigger('click')
    expect(wrapper.get('[data-testid="faq-count"]').text()).toContain('No hay ninguna')

    await wrapper.get('[data-testid="restore-faqs"]').trigger('click')
    await wrapper.get('[data-testid="confirm-restore-yes"]').trigger('click')
    expect(wrapper.find('[data-testid="faq-position-faq-location"]').exists()).toBe(true)
  })

  it('un marcador inexistente en una FAQ encendida apaga el guardado', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="faq-toggle-faq-location"]').trigger('click')
    await wrapper.get('[data-testid="faq-header-faq-location"]').trigger('click')
    await wrapper.get('[data-testid="faq-text-faq-location"]').setValue('Hola {cliente}')

    expect(wrapper.get('[data-testid="invalid-hint"]').text()).toContain('{cliente}')
    expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeDefined()
  })
})

