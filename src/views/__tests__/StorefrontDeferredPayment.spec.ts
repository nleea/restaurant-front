// Un domicilio no sabe todavía cuánto cuesta, así que el checkout no puede pedir el medio de
// pago. Lo que se protege aquí es que el cliente NUNCA vea ni decida sobre un total provisional:
// el paso de pago se salta, el pedido viaja sin método, y no se declara ningún comprobante por
// una cifra que va a subir. Recoger en tienda no cambia — su total ya es el definitivo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const storefrontMock = vi.hoisted(() => ({
  getBranches: vi.fn<(...a: unknown[]) => unknown>(),
  getStorefrontHours: vi.fn<(...a: unknown[]) => unknown>(),
  getAppearance: vi.fn<(...a: unknown[]) => unknown>(),
  getMenu: vi.fn<(...a: unknown[]) => unknown>(),
  createOrder: vi.fn<(...a: unknown[]) => unknown>(),
  resolveStoreSession: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/storefront.api', () => storefrontMock)

const proofMock = vi.hoisted(() => {
  class ProofUploadFailedStub extends Error {}
  return {
    uploadPaymentProof: vi.fn<(...a: unknown[]) => unknown>(),
    ProofUploadFailed: ProofUploadFailedStub,
    MAX_PROOF_BYTES: 5 * 1024 * 1024,
    PROOF_ACCEPT: 'image/png',
  }
})
vi.mock('@/services/paymentProof.api', () => proofMock)

const guestMock = vi.hoisted(() => ({
  getGuestProfile: vi.fn<(...a: unknown[]) => unknown>(),
  saveGuestProfile: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/guestProfile.api', () => guestMock)

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { branchCode: 'CENTRO' }, query: {} }),
  useRouter: () => ({ push: vi.fn<(...a: unknown[]) => unknown>() }),
}))

import StorefrontView from '../StorefrontView.vue'
import { useCartStore } from '@/stores/cart'

const RECEIPT = new File(['bytes'], 'comprobante.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  storefrontMock.getBranches.mockResolvedValue([])
  storefrontMock.getStorefrontHours.mockResolvedValue({
    isOpenNow: true,
    nextOpening: null,
    windows: [],
  })
  storefrontMock.getAppearance.mockRejectedValue(new Error('sin config'))
  storefrontMock.getMenu.mockResolvedValue({ categories: [], products: [], addons: [] })
  storefrontMock.resolveStoreSession.mockResolvedValue(null)
  storefrontMock.createOrder.mockResolvedValue({
    orderId: 'o1',
    orderNumber: 'A-1',
    status: 'open',
    editToken: 'tok-123',
  })
  guestMock.getGuestProfile.mockResolvedValue(null)
  guestMock.saveGuestProfile.mockResolvedValue(undefined)
})

type Vm = {
  confirmOrder: () => Promise<void>
  go: (step: string) => void
  goBack: () => void
  step: string
}

function seedCart(fulfillment: 'delivery' | 'pickup') {
  const cart = useCartStore()
  cart.setContact({ name: 'Ana', phone: '+573001112233' })
  cart.setFulfillment(fulfillment)
  if (fulfillment === 'delivery') {
    cart.setAddress({ street: 'Calle 1 #2-3', neighborhood: 'Centro', reference: '' })
  } else {
    cart.setPayment('transfer')
  }
  cart.addItem({
    productId: 'p1',
    variantId: 'v1',
    name: 'Ceviche',
    unitPrice: 28000,
    quantity: 1,
    addons: [],
    removed: [],
    note: '',
  })
  return cart
}

async function view() {
  const wrapper = mount(StorefrontView)
  await flushPromises()
  return wrapper
}

describe('el checkout de un domicilio', () => {
  it('salta el paso de pago hacia adelante', async () => {
    const wrapper = await view()
    seedCart('delivery')
    const vm = wrapper.vm as unknown as Vm

    vm.go('payment')
    await flushPromises()

    expect(vm.step).toBe('summary')
  })

  it('salta el paso de pago hacia atrás, sin quedarse en bucle', async () => {
    // `go('payment')` desde el resumen aterrizaría en el resumen: el botón "atrás" no haría
    // nada y el cliente quedaría atrapado en el último paso.
    const wrapper = await view()
    seedCart('delivery')
    const vm = wrapper.vm as unknown as Vm

    vm.go('summary')
    vm.goBack()
    await flushPromises()

    expect(vm.step).toBe('fulfillment')
  })

  it('manda el pedido sin medio de pago', async () => {
    const wrapper = await view()
    seedCart('delivery')

    await (wrapper.vm as unknown as Vm).confirmOrder()
    await flushPromises()

    const payload = storefrontMock.createOrder.mock.calls[0]?.[0] as {
      paymentMethod?: string
    }
    expect(payload.paymentMethod).toBeUndefined()
  })

  it('no declara comprobante por un total que todavía va a subir', async () => {
    const wrapper = await view()
    const cart = seedCart('delivery')
    cart.setPaymentProof(RECEIPT)

    await (wrapper.vm as unknown as Vm).confirmOrder()
    await flushPromises()

    expect(proofMock.uploadPaymentProof).not.toHaveBeenCalled()
    expect(cart.orderNumber).toBe('A-1')
  })
})

describe('el checkout de recoger en tienda', () => {
  it('conserva el paso de pago: su total ya es el definitivo', async () => {
    const wrapper = await view()
    seedCart('pickup')
    const vm = wrapper.vm as unknown as Vm

    vm.go('payment')
    await flushPromises()

    expect(vm.step).toBe('payment')
  })

  it('sigue mandando el medio de pago elegido', async () => {
    const wrapper = await view()
    seedCart('pickup')

    await (wrapper.vm as unknown as Vm).confirmOrder()
    await flushPromises()

    const payload = storefrontMock.createOrder.mock.calls[0]?.[0] as {
      paymentMethod?: string
    }
    expect(payload.paymentMethod).toBe('transfer')
  })
})
