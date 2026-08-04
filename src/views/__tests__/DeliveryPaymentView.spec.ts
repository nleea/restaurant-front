// La pantalla de pago del domicilio. Lo que se protege aquí es UNA cifra.
//
// El bug que tenía: declaraba `quoted_fee` — el domicilio — en vez del saldo del pedido. Un
// enlace que cobra $6.000 por un pedido de $38.000 se paga, se marca pagado, y la diferencia
// aparece en la puerta con la comida ya entregada.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const paymentMock = vi.hoisted(() => ({
  getDeliveryPaymentRequest: vi.fn<(...a: unknown[]) => unknown>(),
  selectDeliveryPaymentMethod: vi.fn<(...a: unknown[]) => unknown>(),
  declareDeliveryPayment: vi.fn<(...a: unknown[]) => unknown>(),
  uploadDeliveryPaymentProof: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/deliveryPayment.api', () => paymentMock)

const storefrontMock = vi.hoisted(() => ({
  getAppearance: vi.fn<(...a: unknown[]) => unknown>(),
  getBranches: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/storefront.api', () => storefrontMock)

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { token: 'tok-abc' }, query: {} }),
}))

import DeliveryPaymentView from '../DeliveryPaymentView.vue'

const REQUEST = {
  order_id: '11111111-2222-3333-4444-555555555555',
  order_code: 'AFF5252F',
  lines: [
    { name: 'Ceviche', quantity: 2, line_subtotal: '32000' },
    { name: 'Limonada', quantity: 1, line_subtotal: '6000' },
  ],
  subtotal: '38000',
  discount: '0',
  delivery_fee: '6000',
  total: '44000',
  amount_due: '44000',
  quote_distance_km: '2.400',
  status: 'pending',
  expires_at: '2030-01-01T00:00:00Z',
  address_text: 'Calle 1 #2-3',
  payment_method: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  storefrontMock.getAppearance.mockRejectedValue(new Error('sin config'))
  storefrontMock.getBranches.mockResolvedValue([{ code: 'CENTRO', phone: '+573001112233' }])
  paymentMock.getDeliveryPaymentRequest.mockResolvedValue(REQUEST)
  paymentMock.selectDeliveryPaymentMethod.mockResolvedValue(undefined)
  paymentMock.declareDeliveryPayment.mockResolvedValue({ claim_id: 'c1', status: 'pending', amount: '44000' })
  paymentMock.uploadDeliveryPaymentProof.mockResolvedValue({ claim_id: 'c1', status: 'pending', amount: '44000' })
})

async function view() {
  const wrapper = mount(DeliveryPaymentView)
  await flushPromises()
  return wrapper
}

type Vm = { chooseMethod: (id: string) => Promise<void>; confirmPayment: () => Promise<void> }

describe('la pantalla de pago del domicilio', () => {
  it('muestra el pedido completo, no sólo el domicilio', async () => {
    const wrapper = await view()
    const text = wrapper.text()

    expect(text).toContain('AFF5252F')
    expect(text).toContain('Ceviche')
    expect(text).toContain('Limonada')
    expect(text).toContain('Calle 1 #2-3')
    // Subtotal, domicilio y total: los tres, para que la cifra final se pueda comprobar.
    expect(text).toContain('Subtotal')
    expect(text).toContain('Domicilio')
    expect(text).toContain('A pagar')
  })

  it('ofrece los métodos de pago del negocio', async () => {
    const wrapper = await view()

    expect(wrapper.text()).toContain('Efectivo')
    expect(wrapper.text()).toContain('Transferencia')
  })

  it('declara el SALDO del pedido, nunca el cargo de domicilio', async () => {
    const wrapper = await view()
    const vm = wrapper.vm as unknown as Vm

    await vm.chooseMethod('cash')
    await vm.confirmPayment()
    await flushPromises()

    expect(paymentMock.declareDeliveryPayment).toHaveBeenCalledWith('tok-abc', 44000, 'cash')
    // La cifra que NO debe viajar nunca.
    expect(paymentMock.declareDeliveryPayment).not.toHaveBeenCalledWith(
      'tok-abc',
      6000,
      expect.anything(),
    )
  })

  it('el comprobante también viaja por el saldo, no por el domicilio', async () => {
    const wrapper = await view()
    const vm = wrapper.vm as unknown as Vm & { proof: File | null }

    await vm.chooseMethod('transfer')
    ;(wrapper.vm as unknown as { proof: File | null }).proof = new File(['x'], 'c.jpg')
    await vm.confirmPayment()
    await flushPromises()

    const [, amount] = paymentMock.uploadDeliveryPaymentProof.mock.calls[0] as [string, number]
    expect(amount).toBe(44000)
  })

  it('sin método elegido no se puede confirmar', async () => {
    const wrapper = await view()

    const buttons = wrapper.findAll('button')
    const confirm = buttons[buttons.length - 1]
    expect(confirm).toBeDefined()
    expect(confirm?.attributes('disabled')).toBeDefined()
  })

  it('un enlace muerto se explica, no parece un error del cliente', async () => {
    paymentMock.getDeliveryPaymentRequest.mockRejectedValue(new Error('404'))

    const wrapper = await view()

    expect(wrapper.text()).toContain('Este enlace ya no sirve')
    expect(paymentMock.declareDeliveryPayment).not.toHaveBeenCalled()
    // Y le damos por dónde escribir: prometer "escríbenos" sin enlace es peor que callar.
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(true)
  })

  it('tras declarar, no se le vuelve a pedir el pago', async () => {
    const wrapper = await view()
    const vm = wrapper.vm as unknown as Vm

    await vm.chooseMethod('cash')
    await vm.confirmPayment()
    await flushPromises()

    expect(wrapper.text()).toContain('va en camino')
    expect(wrapper.text()).not.toContain('¿Cómo vas a pagar?')
  })

  it('con comprobante adjunto dice que LLEGÓ', async () => {
    const wrapper = await view()
    const vm = wrapper.vm as unknown as Vm

    await vm.chooseMethod('transfer')
    ;(wrapper.vm as unknown as { proof: File | null }).proof = new File(['x'], 'c.jpg')
    await vm.confirmPayment()
    await flushPromises()

    expect(wrapper.find('[data-outcome-title]').text()).toContain('recibimos tu comprobante')
    // Y NO le pide mandar nada: ya lo mandó.
    expect(wrapper.find('[data-send-proof]').exists()).toBe(false)
  })

  it('sin comprobante NO dice que recibimos el pago, porque no llegó nada', async () => {
    // Decírselo lo da por terminado, el comprobante no llega nunca, y alguien lo busca en un
    // chat donde no está.
    const wrapper = await view()
    const vm = wrapper.vm as unknown as Vm

    await vm.chooseMethod('transfer')
    await vm.confirmPayment()
    await flushPromises()

    const title = wrapper.find('[data-outcome-title]').text()
    expect(title).toContain('Nos falta tu comprobante')
    expect(title).not.toContain('recibimos tu pago')
    // Y mandarlo es LA acción, no un enlace al pie.
    expect(wrapper.find('[data-send-proof]').exists()).toBe(true)
  })

  it('en efectivo no le pide un comprobante que no existe', async () => {
    const wrapper = await view()
    const vm = wrapper.vm as unknown as Vm

    await vm.chooseMethod('cash')
    await vm.confirmPayment()
    await flushPromises()

    expect(wrapper.find('[data-outcome-title]').text()).toContain('va en camino')
    expect(wrapper.text()).toContain('efectivo')
    expect(wrapper.find('[data-send-proof]').exists()).toBe(false)
  })

  it('el enlace de WhatsApp lleva el pedido y el saldo escritos', async () => {
    const wrapper = await view()
    await (wrapper.vm as unknown as Vm).chooseMethod('transfer')
    await flushPromises()

    const href = wrapper.find('a[href^="https://wa.me/"]').attributes('href') ?? ''
    const decoded = decodeURIComponent(href)
    expect(decoded).toContain('AFF5252F')
    expect(decoded).toContain('44.000')
  })
})
