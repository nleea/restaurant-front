// El gate de pago en la comanda: no se cocina para un dinero que nadie ha confirmado.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const authMock = vi.hoisted(() => ({ can: vi.fn<(c: string) => boolean>(() => true) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authMock }))

// La comanda pide los comprobantes al detectar un prepago sin confirmar. Aquí se siembran a
// mano, así que la llamada se dobla para que no salga a la red ni pise lo sembrado.
const ordersApi = vi.hoisted(() => ({ listPaymentClaims: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/orders.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...ordersApi,
}))

import LiveDupe from '../LiveDupe.vue'
import { useOrdersStore } from '@/stores/orders'
import type { PaymentClaim } from '@/services/orders.api'

const ORDER = {
  id: 'o1',
  branch_id: 'b1',
  channel: 'delivery',
  employee_id: 'e1',
  status: 'open',
  subtotal: '25000.00',
  discount: '0.00',
  total: '25000.00',
  dining_table_id: null,
  diner_name: null,
  origin: 'staff',
  customer_id: null,
  whatsapp_contact_id: null as string | null,
  closed_at: null,
  kitchen_state: 'none' as const,
  payment_method: 'transfer' as string | null,
  items: null,
}

function seed(over: Partial<typeof ORDER> = {}, paid = 0) {
  const orders = useOrdersStore()
  orders.orders = [{ ...ORDER, ...over }]
  orders.itemsByOrder = {
    o1: [
      {
        id: 'i1',
        order_id: 'o1',
        product_variant_id: 'v1',
        quantity: 1,
        unit_price: '25000.00',
        product_name: 'Burger',
        variant_name: 'Estándar',
        line_subtotal: '25000.00',
        status: 'pending',
        notes: null,
        sent: false,
      },
    ],
  }
  orders.paymentsByOrder = {
    o1: paid
      ? [
          {
            id: 'p1',
            order_id: 'o1',
            branch_id: 'b1',
            cash_session_id: 'c1',
            amount: String(paid),
            method: 'transfer',
            employee_id: 'e1',
            diner_reference: null,
          },
        ]
      : [],
  }
  return orders
}

const mountDupe = () =>
  mount(LiveDupe, {
    props: { orderId: 'o1', flashItemId: null },
    // `RouterLink` se sustituye: el bloque de verificación enlaza a la bandeja y montar un
    // router entero para comprobar un botón sería pagar de más.
    global: {
      stubs: { DeliveryCard: true, DupeLine: true, NoteSheet: true, RouterLink: true },
    },
  })

beforeEach(() => {
  setActivePinia(createPinia())
  authMock.can.mockImplementation(() => true)
  ordersApi.listPaymentClaims.mockImplementation(async () => {
    // Devuelve lo que la prueba haya sembrado: el `fetch` no debe borrarlo.
    return useOrdersStore().paymentClaims.o1 ?? []
  })
})

describe('payment verification gate in the comanda', () => {
  it('an unverified prepaid order offers verification instead of the kitchen', () => {
    seed()
    const wrapper = mountDupe()

    expect(wrapper.find('[data-verify-block]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Pago por confirmar')
    // Y el botón de cocina NO está: no se cocina para un dinero sin confirmar.
    expect(wrapper.text()).not.toContain('Enviar a cocina')
  })

  it('says what to check and for how much', () => {
    seed()
    const text = mountDupe().text()

    expect(text).toContain('transferencia')
    expect(text).toContain('25.000')
  })

  it('confirming emits one action for pay + fire', async () => {
    seed()
    const wrapper = mountDupe()

    await wrapper.get('[data-verify]').trigger('click')

    expect(wrapper.emitted('verify')).toHaveLength(1)
    // Un solo gesto: no hay un "pagar" y un "enviar" por separado.
    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('a cash order goes straight to the kitchen with no verification', () => {
    seed({ payment_method: 'cash' })
    const wrapper = mountDupe()

    expect(wrapper.find('[data-verify-block]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Enviar a cocina')
  })

  it('an already verified prepaid order behaves like any other', () => {
    seed({}, 25000)
    const wrapper = mountDupe()

    expect(wrapper.find('[data-verify-block]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Enviar a cocina')
  })

  it('without orders.pay the control is not offered, and the reason is stated', () => {
    seed()
    authMock.can.mockImplementation((code: string) => code !== 'orders.pay')
    const wrapper = mountDupe()

    // El bloqueo sigue visible —el usuario debe entender por qué no avanza— pero sin acción.
    expect(wrapper.find('[data-verify-block]').exists()).toBe(true)
    expect(wrapper.find('[data-verify]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sin permiso para confirmar pagos')
  })
})

describe('el comprobante que mandó el cliente', () => {
  const CLAIM = {
    id: 'cl1',
    order_id: 'o1',
    amount: '25000.00',
    method: 'transfer',
    proof_url: 'https://cdn.test/comprobante.jpg',
    status: 'pending' as const,
    rejection_reason: null,
    created_at: '2026-07-31T20:12:09Z',
  }

  it('se ve junto al botón de verificar, con su monto y su hora', async () => {
    const orders = seed()
    orders.paymentClaims = { o1: [CLAIM] }
    const wrapper = mountDupe()
    await flushPromises()

    const claim = wrapper.get('[data-payment-claim]')
    expect(claim.get('img').attributes('src')).toBe(CLAIM.proof_url)
    expect(claim.text()).toContain('25.000')
    expect(claim.text()).toContain('20:12')
    // Y el botón que cobra y manda a cocina sigue siendo el mismo.
    expect(wrapper.find('[data-verify]').exists()).toBe(true)
  })

  it('sin comprobante, verificar sigue ofreciéndose igual', async () => {
    const orders = seed()
    orders.paymentClaims = { o1: [] }
    const wrapper = mountDupe()
    await flushPromises()

    expect(wrapper.find('[data-payment-claim]').exists()).toBe(false)
    expect(wrapper.find('[data-verify]').exists()).toBe(true)
  })

  it('rechazar exige un motivo antes de dejar pulsar', async () => {
    const orders = seed()
    orders.paymentClaims = { o1: [CLAIM] }
    const wrapper = mountDupe()
    await flushPromises()

    await wrapper.get('[data-reject-claim]').trigger('click')
    const confirm = wrapper.get('[data-reject-confirm]')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.get('input[type="text"]').setValue('El comprobante es de otro pedido')
    expect(wrapper.get('[data-reject-confirm]').attributes('disabled')).toBeUndefined()
  })

  it('quien no puede cobrar tampoco ve comprobantes bancarios accionables', async () => {
    authMock.can.mockImplementation(() => false)
    const orders = seed()
    orders.paymentClaims = { o1: [CLAIM] }
    const wrapper = mountDupe()
    await flushPromises()

    expect(wrapper.find('[data-reject-claim]').exists()).toBe(false)
    expect(wrapper.find('[data-verify]').exists()).toBe(false)
  })
})

describe('el atajo a la conversación de WhatsApp', () => {
  // La regla: el atajo se decide por "¿hay algo que MIRAR?", no por "¿hay declaración?".
  // Confundir las dos lo escondió justo cuando hacía falta — desde que existe el enlace de pago
  // del domicilio, el cliente puede pulsar "Ya pagué" sin adjuntar nada, porque el propio enlace
  // le ofrece mandarlo por WhatsApp. Esa declaración pelada ES la señal de ir a buscarlo.
  const claim = (over: Partial<PaymentClaim> = {}): PaymentClaim => ({
    id: 'cl1',
    order_id: 'o1',
    amount: '25000.00',
    method: 'transfer',
    status: 'pending',
    proof_url: null,
    rejection_reason: null,
    created_at: '2026-08-03T10:00:00Z',
    ...over,
  })

  const shortcut = (wrapper: ReturnType<typeof mountDupe>) =>
    wrapper.find('[data-open-inbox]')

  it('sin ninguna declaración, lleva al chat', async () => {
    const orders = seed({ whatsapp_contact_id: 'wa1' })
    orders.paymentClaims = { o1: [] }
    const wrapper = mountDupe()
    await flushPromises()

    expect(shortcut(wrapper).exists()).toBe(true)
  })

  it('con una declaración SIN comprobante, lleva al chat', async () => {
    // El caso que estaba roto: "ya pagué" a secas significa que el comprobante está en el chat.
    const orders = seed({ whatsapp_contact_id: 'wa1' })
    orders.paymentClaims = { o1: [claim()] }
    const wrapper = mountDupe()
    await flushPromises()

    expect(shortcut(wrapper).exists()).toBe(true)
  })

  it('con un comprobante adjunto, NO lleva al chat', async () => {
    // La imagen ya está delante; un segundo camino hacia ella es ruido.
    const orders = seed({ whatsapp_contact_id: 'wa1' })
    orders.paymentClaims = { o1: [claim({ proof_url: 'https://cdn/x.jpg' })] }
    const wrapper = mountDupe()
    await flushPromises()

    expect(shortcut(wrapper).exists()).toBe(false)
  })

  it('basta UN comprobante entre varias declaraciones para no ofrecerlo', async () => {
    const orders = seed({ whatsapp_contact_id: 'wa1' })
    orders.paymentClaims = {
      o1: [claim(), claim({ id: 'cl2', proof_url: 'https://cdn/x.jpg' })],
    }
    const wrapper = mountDupe()
    await flushPromises()

    expect(shortcut(wrapper).exists()).toBe(false)
  })

  it('sin contacto de WhatsApp no hay atajo: no hay conversación a la que ir', async () => {
    const orders = seed({ whatsapp_contact_id: null })
    orders.paymentClaims = { o1: [claim()] }
    const wrapper = mountDupe()
    await flushPromises()

    expect(shortcut(wrapper).exists()).toBe(false)
  })
})

describe('cómo va a pagar, cuando no hay nada que verificar', () => {
  // Sin esta línea la comanda no dice NADA del pago: un domicilio en efectivo y uno donde el
  // cliente todavía no ha elegido se ven idénticos —un botón de cocina y nada más— y quien
  // decide mandarlo a cocina no tiene con qué decidir.
  const intent = (wrapper: ReturnType<typeof mountDupe>) =>
    wrapper.find('[data-payment-intent]')

  it('efectivo lo dice, y dice que se puede cocinar', () => {
    seed({ payment_method: 'cash' })
    const wrapper = mountDupe()

    expect(intent(wrapper).text()).toContain('efectivo')
    expect(intent(wrapper).text()).toContain('cobra en la puerta')
    // Y el botón de cocina está: en efectivo no hay nada que verificar antes.
    expect(wrapper.text()).toContain('Enviar a cocina')
  })

  it('un domicilio sin método elegido lo dice, y dice dónde lo elige el cliente', () => {
    seed({ payment_method: null, channel: 'delivery' })
    const wrapper = mountDupe()

    expect(intent(wrapper).text()).toContain('Aún no ha elegido')
    expect(intent(wrapper).text()).toContain('enlace de pago')
  })

  it('un prepago sin confirmar no lo repite: ya lo cuenta el bloque de verificación', () => {
    seed({ payment_method: 'transfer' })
    const wrapper = mountDupe()

    expect(intent(wrapper).exists()).toBe(false)
    expect(wrapper.find('[data-verify-block]').exists()).toBe(true)
  })

  it('un pedido de mostrador sin método no inventa un aviso', () => {
    seed({ payment_method: null, channel: 'takeaway' })
    const wrapper = mountDupe()

    expect(intent(wrapper).exists()).toBe(false)
  })
})
