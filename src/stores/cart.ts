import { defineStore } from 'pinia'
import {
  emptyAddress,
  lineTotal,
  type AddressInfo,
  type CartItem,
  type FulfillmentType,
  type GpsInfo,
  type LocationMode,
} from '@/lib/storefront'

// The customer's in-progress order: cart lines + contact + fulfillment + payment, with derived
// totals. The order is placed via the storefront API (see StorefrontView); the store holds the
// server-confirmed order number + status once placed.
interface CartState {
  items: CartItem[]
  customerName: string
  customerPhone: string
  fulfillment: FulfillmentType
  locationMode: LocationMode
  address: AddressInfo
  gps: GpsInfo | null
  paymentMethodId: string | null
  orderNumber: string | number | null
  orderStatus: string | null
  // Sobrevive al pedido para que la confirmación pueda ofrecer "corregir mi pedido". Se va con
  // el `reset()` del carrito: es de ESE pedido y de ningún otro.
  orderEditToken: string | null
  // El comprobante que el cliente adjuntó en el paso de pago. Vive aquí y no viaja con el
  // pedido porque se sube DESPUÉS: la puerta del comprobante se abre con el token del pedido,
  // que no existe hasta que el pedido existe.
  paymentProof: File | null
  // Qué pasó con esa subida. `null` mientras nadie lo intente; un texto = falló y hay que
  // decirlo, nunca pintarlo como enviado.
  paymentProofError: string | null
}

// Fields that define a cart line's configuration (everything except the line's own uid).
export type CartItemConfig = Omit<CartItem, 'uid'>

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    items: [],
    customerName: '',
    customerPhone: '',
    fulfillment: 'delivery',
    locationMode: 'manual',
    address: emptyAddress(),
    gps: null,
    paymentMethodId: null,
    orderNumber: null,
    orderStatus: null,
    orderEditToken: null,
    paymentProof: null,
    paymentProofError: null,
  }),

  getters: {
    itemCount: (state): number => state.items.reduce((n, it) => n + it.quantity, 0),
    subtotal: (state): number => state.items.reduce((sum, it) => sum + lineTotal(it), 0),
    // Siempre cero, y sin leer el estado: eso es exactamente lo que garantiza. El domicilio se
    // cotiza en el servidor cuando la ubicación se resuelve, y llega con el enlace de pago. Un
    // precio provisional pintado aquí es un número que el cliente memoriza y que el total real
    // contradice — en la puerta.
    deliveryFee: (): number => 0,
    total(): number {
      return this.subtotal + this.deliveryFee
    },
    isEmpty: (state): boolean => state.items.length === 0,
    // Name + phone are required to place an order (customer reuse + kitchen callback).
    contactReady: (state): boolean =>
      state.customerName.trim() !== '' && state.customerPhone.trim() !== '',
    // The order can be confirmed once contact + fulfillment details are set.
    fulfillmentReady(state): boolean {
      if (state.customerName.trim() === '' || state.customerPhone.trim() === '') return false
      if (state.fulfillment === 'pickup') return true
      if (state.locationMode === 'gps') return state.gps !== null
      return state.address.street.trim() !== '' && state.address.neighborhood.trim() !== ''
    },
  },

  actions: {
    addItem(config: CartItemConfig): void {
      this.items.push({ ...config, uid: crypto.randomUUID() })
    },
    updateItem(uid: string, config: CartItemConfig): void {
      const idx = this.items.findIndex((it) => it.uid === uid)
      if (idx !== -1) this.items[idx] = { ...config, uid }
    },
    removeItem(uid: string): void {
      this.items = this.items.filter((it) => it.uid !== uid)
    },
    setQuantity(uid: string, quantity: number): void {
      const item = this.items.find((it) => it.uid === uid)
      if (!item) return
      if (quantity <= 0) this.removeItem(uid)
      else item.quantity = quantity
    },

    setFulfillment(type: FulfillmentType): void {
      this.fulfillment = type
    },
    setLocationMode(mode: LocationMode): void {
      this.locationMode = mode
    },
    setAddress(patch: Partial<AddressInfo>): void {
      this.address = { ...this.address, ...patch }
    },
    setGps(gps: GpsInfo | null): void {
      this.gps = gps
    },
    setPayment(id: string): void {
      this.paymentMethodId = id
    },
    setPaymentProof(file: File | null): void {
      this.paymentProof = file
      this.paymentProofError = null
    },
    setPaymentProofError(message: string | null): void {
      this.paymentProofError = message
    },
    setContact(patch: Partial<{ name: string; phone: string }>): void {
      if (patch.name !== undefined) this.customerName = patch.name
      if (patch.phone !== undefined) this.customerPhone = patch.phone
    },

    // Record the server-confirmed order once placed via the storefront API.
    setConfirmedOrder(
      orderNumber: string | number,
      status: string,
      editToken: string | null = null,
    ): void {
      this.orderNumber = orderNumber
      this.orderStatus = status
      this.orderEditToken = editToken
    },
    reset(): void {
      this.$reset()
    },
  },
})
