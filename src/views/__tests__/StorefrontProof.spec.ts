// El adjunto del checkout tiene que MANDAR el comprobante. Antes pintaba un botón y tiraba el
// archivo — el cliente creía haberlo mandado y en el restaurante no había nada.
//
// Y sube DESPUÉS de crear el pedido: la puerta del comprobante se abre con el token del pedido,
// que no existe hasta que el pedido existe.
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
  storefrontMock.getStorefrontHours.mockResolvedValue({ isOpenNow: true, nextOpening: null, windows: [] })
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

/** Un carrito listo para confirmar, con comprobante adjunto. */
function readyCart(withProof = true) {
  const cart = useCartStore()
  cart.setContact({ name: 'Ana', phone: '+573001112233' })
  cart.setFulfillment('pickup')
  cart.setPayment('transfer')
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
  if (withProof) cart.setPaymentProof(RECEIPT)
  return cart
}

async function placeOrder(withProof = true) {
  const wrapper = mount(StorefrontView)
  await flushPromises()
  const cart = readyCart(withProof)
  await (wrapper.vm as unknown as { confirmOrder: () => Promise<void> }).confirmOrder()
  await flushPromises()
  return { wrapper, cart }
}

describe('el comprobante del checkout', () => {
  it('viaja con el token del pedido recién creado', async () => {
    const { cart } = await placeOrder()

    expect(proofMock.uploadPaymentProof).toHaveBeenCalledWith('tok-123', RECEIPT, cart.total)
    expect(cart.paymentProofError).toBeNull()
  })

  it('sin adjunto no se intenta nada', async () => {
    await placeOrder(false)
    expect(proofMock.uploadPaymentProof).not.toHaveBeenCalled()
  })

  it('una subida fallida se cuenta; el pedido sigue en pie', async () => {
    proofMock.uploadPaymentProof.mockRejectedValue(
      new proofMock.ProofUploadFailed('No pudimos subir tu comprobante.'),
    )
    const { cart } = await placeOrder()

    expect(cart.paymentProofError).toBe('No pudimos subir tu comprobante.')
    // El pedido se creó igual: perder el comprobante no puede perder la venta.
    expect(cart.orderNumber).toBe('A-1')
  })
})
