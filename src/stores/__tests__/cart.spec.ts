import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCartStore, type CartItemConfig } from '@/stores/cart'
import { lineTotal } from '@/lib/storefront'

function config(over: Partial<CartItemConfig> = {}): CartItemConfig {
  return {
    productId: 'p1',
    variantId: 'v1',
    name: 'Ceviche',
    unitPrice: 28000,
    quantity: 1,
    addons: [],
    removed: [],
    note: '',
    ...over,
  }
}

describe('lineTotal', () => {
  it('adds selected addons then multiplies by quantity', () => {
    expect(
      lineTotal({
        uid: 'x',
        ...config({ quantity: 2, addons: [{ id: 'a', name: 'Aguacate', price: 3000 }] }),
      }),
    ).toBe((28000 + 3000) * 2)
  })
})

describe('cart store totals', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('sums subtotal and item count across lines', () => {
    const cart = useCartStore()
    cart.addItem(config({ quantity: 2 })) // 56000
    cart.addItem(config({ productId: 'p2', name: 'Limonada', unitPrice: 9000 })) // 9000
    expect(cart.itemCount).toBe(3)
    expect(cart.subtotal).toBe(65000)
  })

  it('never invents a delivery fee: the server quotes it after the location resolves', () => {
    // Antes había $6.000 fijos aquí. Un precio inventado en el cliente es un número que el
    // cliente lee, memoriza, y que el total real contradice — y esa contradicción se descubre
    // en la puerta. El valor del domicilio llega cotizado, con el enlace de pago.
    const cart = useCartStore()
    cart.addItem(config())
    cart.setFulfillment('delivery')
    expect(cart.deliveryFee).toBe(0)
    expect(cart.total).toBe(cart.subtotal)
    cart.setFulfillment('pickup')
    expect(cart.deliveryFee).toBe(0)
    expect(cart.total).toBe(cart.subtotal)
  })

  it('never charges delivery on an empty cart', () => {
    const cart = useCartStore()
    cart.setFulfillment('delivery')
    expect(cart.deliveryFee).toBe(0)
  })

  it('removing a line via setQuantity(0) drops it', () => {
    const cart = useCartStore()
    cart.addItem(config())
    const uid = cart.items[0]!.uid
    cart.setQuantity(uid, 0)
    expect(cart.items).toHaveLength(0)
  })

  it('gates delivery readiness on contact + a minimal address', () => {
    const cart = useCartStore()
    cart.setFulfillment('delivery')
    cart.setLocationMode('manual')
    cart.setContact({ name: 'Ana', phone: '3001234567' })
    expect(cart.fulfillmentReady).toBe(false)
    cart.setAddress({ street: 'Calle 1', neighborhood: 'Centro' })
    expect(cart.fulfillmentReady).toBe(true)
  })

  it('requires name and phone before an order can proceed', () => {
    const cart = useCartStore()
    cart.setFulfillment('pickup')
    // Pickup needs no address, but contact is still required.
    expect(cart.fulfillmentReady).toBe(false)
    cart.setContact({ name: 'Ana', phone: '3001234567' })
    expect(cart.contactReady).toBe(true)
    expect(cart.fulfillmentReady).toBe(true)
  })
})
