// La pantalla que el cliente mira JUSTO ANTES de salirse a pagar.
//
// Es el momento de mayor palanca del flujo, y antes decía «En preparación» de un pedido que la
// cocina no había visto. Esa mentira es la que produce el "¿ya está listo?" y la decepción en la
// puerta, así que las dos primeras pruebas son sobre eso.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import ConfirmationStep from '../ConfirmationStep.vue'
import { useCartStore } from '@/stores/cart'

const WHATSAPP = 'https://wa.me/573001112233?text=Hola%2C%20mi%20pedido%20A3F2'

function mountStep(
  cartSetup: (cart: ReturnType<typeof useCartStore>) => void,
  whatsappHref: string | null = WHATSAPP,
) {
  setActivePinia(createPinia())
  const cart = useCartStore()
  // Una línea de verdad: el estado se deriva del SALDO, así que un carrito vacío no debe nada y
  // se leería como saldado.
  cart.addItem({
    productId: 'p1',
    variantId: 'v1',
    name: 'Hamburguesa',
    unitPrice: 46000,
    quantity: 1,
    addons: [],
    removed: [],
    note: '',
  })
  cart.fulfillment = 'pickup'
  cart.setConfirmedOrder('A3F2', 'open', 'tok-1')
  cartSetup(cart)
  return mount(ConfirmationStep, {
    props: { restaurantName: 'Sabor Costeño', whatsappHref },
    global: { stubs: { OrderTicket: true } },
  })
}

describe('ConfirmationStep', () => {
  it('un prepago sin comprobante dice que se espera el pago, no «En preparación»', () => {
    const wrapper = mountStep((cart) => {
      cart.paymentMethodId = 'transfer'
    })

    expect(wrapper.get('[data-testid="order-state"]').text()).toBe('Esperando tu pago')
    expect(wrapper.text()).toContain('entra a cocina')
    expect(wrapper.text()).not.toContain('En preparación')
  })

  it('y ofrece mandarlo por WhatsApp, que es la ruta que la gente usa', () => {
    // El banco ofrece "compartir por WhatsApp" justo cuando acaba de pagar; volver a esta pestaña
    // es la parte que no pasa.
    const wrapper = mountStep((cart) => {
      cart.paymentMethodId = 'transfer'
    })

    expect(wrapper.get('[data-testid="send-proof-whatsapp"]').attributes('href')).toBe(WHATSAPP)
  })

  it('con el comprobante ya adjunto no se le vuelve a pedir', () => {
    const wrapper = mountStep((cart) => {
      cart.paymentMethodId = 'transfer'
      cart.paymentProof = new File(['x'], 'comprobante.jpg', { type: 'image/jpeg' })
    })

    expect(wrapper.get('[data-testid="order-state"]').text()).toBe('Revisando tu comprobante')
    expect(wrapper.text()).toContain('Ya lo recibimos')
    // Y no se ofrece la ruta de WhatsApp: ya mandó algo.
    expect(wrapper.find('[data-testid="send-proof-whatsapp"]').exists()).toBe(false)
  })

  it('si la subida falló, se vuelve a pedir en vez de darlo por bueno', () => {
    const wrapper = mountStep((cart) => {
      cart.paymentMethodId = 'transfer'
      cart.paymentProof = new File(['x'], 'comprobante.jpg', { type: 'image/jpeg' })
      cart.paymentProofError = 'No se pudo subir'
    })

    expect(wrapper.get('[data-testid="order-state"]').text()).toBe('Esperando tu pago')
  })

  it('un pedido en efectivo se comporta como siempre', () => {
    const wrapper = mountStep((cart) => {
      cart.paymentMethodId = 'cash'
    })

    // Sigue mostrando el estado que venga del servidor, como antes de este change: lo que se
    // arregló es que un PREPAGO no lo muestre, no cómo se llama el estado normal.
    expect(wrapper.get('[data-testid="order-state"]').text()).not.toContain('Esperando')
    expect(wrapper.text()).toContain('Te avisaremos cuando esté en camino')
    expect(wrapper.find('[data-testid="send-proof-whatsapp"]').exists()).toBe(false)
  })

  it('sin teléfono de sede no hay botón muerto', () => {
    const wrapper = mountStep((cart) => {
      cart.paymentMethodId = 'transfer'
    }, null)

    expect(wrapper.get('[data-testid="order-state"]').text()).toBe('Esperando tu pago')
    expect(wrapper.find('[data-testid="send-proof-whatsapp"]').exists()).toBe(false)
  })
})
