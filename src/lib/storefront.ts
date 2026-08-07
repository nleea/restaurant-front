// Types + money math for the public storefront (the customer-facing carta + order flow). English
// identifiers are binding; Spanish lives only in UI copy. The visual theme is the tenant's — consumed
// from the shared appearance config (see lib/menuAppearance.ts) and applied as CSS variables — so
// nothing here hardcodes color.

export interface Addon {
  id: string
  name: string
  price: number
}

export interface StorefrontCategory {
  id: string
  name: string
}

export interface StorefrontProduct {
  id: string
  categoryId: string
  name: string
  description: string
  price: number
  /** Remote photo URL; empty falls back to a themed monogram tile. */
  imageUrl: string
  /** Playful glyph shown on the fallback tile when there's no photo. */
  emoji?: string
  /** The sellable variant to order (from the public menu read-model); null if none is sellable. */
  variantId: string | null
  /** Ingredients the dish ships with that a customer may exclude ("Sin cebolla"). */
  removableIngredients: string[]
  /** Addons available for this product, by id. */
  addonIds: string[]
}

// One configured line in the cart. The same product can appear as several lines with different
// addons/removals/notes, so each line owns a stable `uid`.
export interface CartItem {
  uid: string
  productId: string
  /** Sellable variant id this line orders (carried from the product; needed by the order API). */
  variantId: string | null
  name: string
  unitPrice: number
  quantity: number
  addons: Addon[]
  removed: string[]
  note: string
}

/** Customer contact captured at checkout — name + phone are required to place an order. */
export interface CustomerContact {
  name: string
  phone: string
}

/** Per-line total: (base + selected addons) × quantity. */
export function lineTotal(item: CartItem): number {
  const addons = item.addons.reduce((sum, a) => sum + a.price, 0)
  return (item.unitPrice + addons) * item.quantity
}

export type FulfillmentType = 'pickup' | 'delivery'
export type LocationMode = 'manual' | 'gps'

export interface AddressInfo {
  street: string
  number: string
  neighborhood: string
  city: string
  reference: string
}

export interface GpsInfo {
  lat: number
  lng: number
  reference: string
}

export function emptyAddress(): AddressInfo {
  return { street: '', number: '', neighborhood: '', city: '', reference: '' }
}

export interface PaymentMethod {
  id: string
  label: string
  icon: string
  /** Whether the customer must attach a payment receipt (e.g. bank transfer). */
  needsProof: boolean
  /** Extra info shown when selected (account details, gateway note…). */
  info?: string
}

// Mock fulfillment facts (no real geocoding / distance yet).
export const DELIVERY_FEE = 6000
export const PICKUP_ADDRESS = 'Calle 1 #4-12, Centro · Riohacha'
export const PICKUP_ETA = '20–30 min'
export const DELIVERY_ETA = '35–50 min'

/** The customer flow, as a linear step machine (product detail is an overlay, not a step). */
export type Step = 'menu' | 'cart' | 'fulfillment' | 'payment' | 'summary' | 'confirmation'
