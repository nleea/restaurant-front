// Public storefront API: unauthenticated, tenant resolved by the Host subdomain (like /auth/login).
// Serves the saved appearance config, a customer-safe menu read-model, and accepts a real order.
// Money arrives as decimal strings (project convention); the mapper turns them into numbers for the
// storefront UI. Nothing here is gated — these endpoints are public by design.
import { http } from '@/lib/http'
import type { MenuAppearanceConfig } from '@/lib/menuAppearance'
import type { Addon, StorefrontCategory, StorefrontProduct } from '@/lib/storefront'

// --- Wire shapes (match the backend /storefront read-model exactly) ------------------------
interface WireAddon {
  id: string
  name: string
  price: string
}
interface WireProduct {
  id: string
  categoryId: string
  name: string
  description: string | null
  imageUrl: string | null
  price: string
  variantId: string | null
  addons: WireAddon[]
  removableIngredients: string[]
}
interface WireMenu {
  categories: StorefrontCategory[]
  products: WireProduct[]
}

/** Normalized menu the storefront renders: category list, product list, and the addon directory. */
export interface StorefrontMenu {
  categories: StorefrontCategory[]
  products: StorefrontProduct[]
  addons: Addon[]
}

// --- Order intake -------------------------------------------------------------------------
export interface OrderLinePayload {
  variantId: string
  quantity: number
  addonIds: string[]
  removedIngredients: string[]
  note: string
}
export interface CreateOrderPayload {
  customer: { name: string; phone: string }
  fulfillment: {
    type: 'pickup' | 'delivery'
    neighborhood?: string
    addressText?: string
    latitude?: number
    longitude?: number
    reference?: string
  }
  // Ausente en un domicilio: su total todavía no incluye el domicilio, así que el cliente aún
  // no puede elegir cómo pagarlo. Lo recoge el enlace de pago que llega por WhatsApp.
  paymentMethod?: string
  lines: OrderLinePayload[]
  // Viaja del enlace de WhatsApp al pedido para enlazarlo con el contacto que escribió. Nunca
  // se pinta en un campo visible: es una credencial de portador, y un token en pantalla acaba
  // en una captura compartida.
  storeToken?: string
}
export interface CreatedOrder {
  orderId: string
  orderNumber: string | number
  status: string
  // El token con el que este cliente vuelve a abrir SU pedido para corregirlo (`/my-order/:token`).
  // Llega aquí y no en una consulta aparte porque éste es el único instante en que sabemos sin
  // lugar a dudas que quien está delante es su dueño.
  editToken: string | null
}

// Public opening hours + whether open now + the next opening (for "cerrado · abrimos a las X").
export interface StorefrontHours {
  isOpenNow: boolean
  nextOpening: { weekday: number; minute: number } | null
  windows: { weekday: number; openMinute: number; closeMinute: number }[]
}

/** A branch the customer can order from. `code` is what addresses it in the URL. */
export interface StorefrontBranch {
  id: string
  code: string
  name: string
  address: string | null
  /** El WhatsApp de la sede: a dónde manda el cliente su comprobante si prefiere el chat. */
  phone: string | null
}

// The branch is a PATH segment, not a query param or a body field: it is what a customer
// receives in a link and pastes back, and it keeps the carta they saw and the kitchen that
// gets the ticket on the same URL. `undefined` means "the tenant's primary branch" — the
// short link single-branch tenants keep using.
function scoped(path: string, branchCode?: string): string {
  return branchCode ? `/storefront/${encodeURIComponent(branchCode)}${path}` : `/storefront${path}`
}

export async function getBranches(): Promise<StorefrontBranch[]> {
  return (await http.get<StorefrontBranch[]>('/storefront/branches')).data
}

/** A quién resuelve el token del enlace de WhatsApp: sólo lo que precarga el checkout. */
export interface StoreSession {
  name: string | null
  phone: string
  branchCode: string | null
}

/**
 * Resuelve el token del enlace, o `null` si no vale.
 *
 * El token NO autentica: lo que devuelve es un nombre y un teléfono que el cliente puede
 * corregir a mano. Un token desconocido y uno vencido responden lo mismo (404), y aquí los
 * dos se tratan igual — checkout vacío, sin error. Alguien que llega con un enlace viejo no
 * ha hecho nada malo y no tiene nada que arreglar; enseñarle un error sólo le diría que el
 * restaurante está roto.
 */
export async function resolveStoreSession(token: string): Promise<StoreSession | null> {
  try {
    return (await http.get<StoreSession>(`/storefront/session/${encodeURIComponent(token)}`)).data
  } catch {
    return null
  }
}

export async function getStorefrontHours(branchCode?: string): Promise<StorefrontHours> {
  return (await http.get<StorefrontHours>(scoped('/hours', branchCode))).data
}

export async function getAppearance(): Promise<MenuAppearanceConfig> {
  return (await http.get<MenuAppearanceConfig>('/storefront/appearance')).data
}

export async function getMenu(branchCode?: string): Promise<StorefrontMenu> {
  const wire = (await http.get<WireMenu>(scoped('/menu', branchCode))).data
  const addonMap = new Map<string, Addon>()
  const products: StorefrontProduct[] = wire.products.map((p) => {
    for (const a of p.addons) {
      if (!addonMap.has(a.id)) addonMap.set(a.id, { id: a.id, name: a.name, price: Number(a.price) })
    }
    return {
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      description: p.description ?? '',
      price: Number(p.price) || 0,
      imageUrl: p.imageUrl ?? '',
      variantId: p.variantId,
      removableIngredients: p.removableIngredients,
      addonIds: p.addons.map((a) => a.id),
    }
  })
  return { categories: wire.categories, products, addons: [...addonMap.values()] }
}

export async function createOrder(
  payload: CreateOrderPayload,
  branchCode?: string,
): Promise<CreatedOrder> {
  return (await http.post<CreatedOrder>(scoped('/orders', branchCode), payload)).data
}

// --- Pedido en mesa por QR ------------------------------------------------------------------
/** La mesa detrás del QR pegado a ella, más si el negocio puede atender ahora mismo. */
export interface StorefrontTable {
  id: string
  number: string
  branchId: string
  branchName: string
  // Viene en la PRIMERA petición para poder decir "todavía no abrimos" antes del carrito. Que
  // alguien monte un pedido entero y se lo rechacen al confirmar es hacerle perder el tiempo
  // por algo que ya se sabía.
  canOrderNow: boolean
}

export interface CreateTableOrderPayload {
  dinerName: string
  lines: OrderLinePayload[]
}

// Sede y mesa son SEGMENTOS de ruta, nunca cuerpo ni query. Es la misma regla que ya defiende
// la carta y aquí importa más: una mesa en el cuerpo dejaría pedir a la mesa 5 mirando la carta
// de otra sede, y la comida saldría en la cocina equivocada.
function tableScoped(branchCode: string, tableCode: string, path = ''): string {
  return `/storefront/${encodeURIComponent(branchCode)}/tables/${encodeURIComponent(tableCode)}${path}`
}

export async function resolveTable(branchCode: string, tableCode: string): Promise<StorefrontTable> {
  return (await http.get<StorefrontTable>(tableScoped(branchCode, tableCode))).data
}

export async function createTableOrder(
  branchCode: string,
  tableCode: string,
  payload: CreateTableOrderPayload,
): Promise<CreatedOrder> {
  return (await http.post<CreatedOrder>(tableScoped(branchCode, tableCode, '/orders'), payload)).data
}
