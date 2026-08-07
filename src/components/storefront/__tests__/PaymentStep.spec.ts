// El paso de pago del checkout: el QR que se escanea y el adjunto que SÍ guarda el archivo.
//
// El adjunto vivía dentro de un `v-for`, y ahí Vue convierte un template ref en un ARRAY: el
// `fileInput.click()` no existía y el botón no hacía nada. Por eso ahora es un `label for`, y por
// eso hay una prueba: el fallo era invisible — el botón se pintaba igual.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import PaymentStep from '../PaymentStep.vue'
import { useCartStore } from '@/stores/cart'

const QR = 'https://cdn.test/qr-nequi.png'

function mountStep(props: Record<string, unknown> = {}) {
  const cart = useCartStore()
  cart.setPayment('transfer') // el único método con comprobante en el catálogo de prueba
  return mount(PaymentStep, { props })
}

beforeEach(() => setActivePinia(createPinia()))

describe('el QR de pago', () => {
  it('enseña el que subió el negocio, para escanearlo', () => {
    const wrapper = mountStep({ paymentQrUrl: QR })
    const img = wrapper.get('img[alt="QR para pagar"]')
    expect(img.attributes('src')).toBe(QR)
  })

  it('sin QR subido no pinta un cuadrito que no escanea', () => {
    const wrapper = mountStep({ paymentQrUrl: '' })
    expect(wrapper.find('img[alt="QR para pagar"]').exists()).toBe(false)
  })
})

describe('adjuntar el comprobante', () => {
  it('el control abre el selector de verdad (label ligado al input)', () => {
    const wrapper = mountStep()
    const label = wrapper.get('[data-attach-proof]')
    const input = wrapper.get('input[type="file"]')
    // La única forma de que el clic abra el selector sin JavaScript: que el `for` apunte al id.
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(label.attributes('for')).toBeTruthy()
  })

  it('el archivo elegido queda en el carrito, listo para subirse con el pedido', async () => {
    const wrapper = mountStep()
    const cart = useCartStore()
    const file = new File(['bytes'], 'comprobante.jpg', { type: 'image/jpeg' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })

    await input.trigger('change')

    expect(cart.paymentProof).toBe(file)
    expect(wrapper.get('[data-attach-proof]').text()).toContain('comprobante.jpg')
  })

  it('un archivo enorme se rechaza aquí, antes de gastarle los datos al cliente', async () => {
    const wrapper = mountStep()
    const cart = useCartStore()
    const huge = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    Object.defineProperty(huge, 'size', { value: 6 * 1024 * 1024 })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [huge] })

    await input.trigger('change')

    expect(cart.paymentProof).toBeNull()
    expect(wrapper.text()).toContain('pesa demasiado')
  })

  it('ofrece también mandarlo por WhatsApp cuando la sede tiene número', () => {
    const wrapper = mountStep({ whatsappHref: 'https://wa.me/573001112233' })
    expect(wrapper.get('a[href^="https://wa.me/"]').text()).toContain('WhatsApp')
  })
})
