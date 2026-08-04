// «Mi pedido»: leer y corregir el propio pedido desde el enlace. Público y sin login — el token
// de la URL ES la credencial, y sólo abre ESE pedido. Tenant por subdominio, como el resto del
// storefront.
//
// El dinero llega como cadena decimal (convención del proyecto) y aquí se vuelve número para la
// UI. Los veredictos (`editable`, `refusal`, `reason`) vienen calculados por el servidor y NO se
// recalculan aquí: la pantalla no sabe si la plancha ya empezó, y fingir que sí es exactamente
// cómo se le promete al cliente un cambio que el servidor va a rechazar.
import { http } from '@/lib/http'
import { detailOf } from '@/lib/apiError'

export interface MyOrderAddon {
  id: string
  name: string
  price: number
}

export interface MyOrderLine {
  itemId: string
  variantId: string
  name: string
  quantity: number
  unitPrice: number
  lineSubtotal: number
  status: string
  addons: MyOrderAddon[]
  /** Exclusiones ya elegidas, separadas por el servidor del texto libre. */
  removedIngredients: string[]
  note: string
  /** Lo que se le PUEDE quitar a este plato (catálogo), para pintar las casillas. */
  removableIngredients: string[]
  editable: boolean
  refusal: string | null
  /** La frase ya escrita del motivo — se pinta tal cual, no se traduce aquí. */
  reason: string | null
}

export interface MyOrder {
  orderId: string
  status: string
  kitchenState: string
  total: number
  paid: number
  outstanding: number
  editable: boolean
  refusal: string | null
  reason: string | null
  lines: MyOrderLine[]
  /** Teléfono de la sede, para lo que esta pantalla no hace (quitar, cancelar). */
  contactPhone: string | null
  /** Cómo dijo al pedir que iba a pagar (`cash`, `transfer`, `card`, `online`…). */
  paymentMethod: string | null
  /** Mandó un comprobante y nadie lo ha mirado. NO significa pagado: el saldo sigue igual. */
  paymentProofPending: boolean
}

/** Lo que se puede pedir. No hay verbo para quitar, bajar ni cancelar: eso lo hace una persona. */
export interface MyOrderEdit {
  add?: {
    variantId: string
    quantity: number
    addonIds: string[]
    removedIngredients: string[]
    note: string
  }[]
  edit?: {
    itemId: string
    quantity?: number
    addAddonIds?: string[]
    removedIngredients?: string[]
    note?: string
    variantId?: string
  }[]
}

/** Un no del servidor, con su motivo. `refusal` es el código; `message`, la frase para el cliente. */
export class MyOrderRefused extends Error {
  constructor(
    readonly refusal: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'MyOrderRefused'
  }
}

interface WireLine extends Omit<MyOrderLine, 'unitPrice' | 'lineSubtotal' | 'addons' | 'note'> {
  unitPrice: string
  lineSubtotal: string
  note: string | null
  addons: { id: string; name: string; price: string }[]
}
interface WireOrder extends Omit<MyOrder, 'total' | 'paid' | 'outstanding' | 'lines'> {
  total: string
  paid: string
  outstanding: string
  lines: WireLine[]
}
interface WireEditResponse {
  totalBefore: string
  order: WireOrder
}

function toOrder(wire: WireOrder): MyOrder {
  return {
    ...wire,
    total: Number(wire.total) || 0,
    paid: Number(wire.paid) || 0,
    outstanding: Number(wire.outstanding) || 0,
    lines: wire.lines.map((l) => ({
      ...l,
      unitPrice: Number(l.unitPrice) || 0,
      lineSubtotal: Number(l.lineSubtotal) || 0,
      note: l.note ?? '',
      addons: l.addons.map((a) => ({ ...a, price: Number(a.price) || 0 })),
    })),
  }
}

function refusalOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: { data?: { refusal?: unknown } } }).response?.data
    if (typeof data?.refusal === 'string') return data.refusal
  }
  return null
}

/**
 * El pedido detrás del enlace, o `null` si el enlace ya no sirve.
 *
 * Vencido, desconocido y de otro negocio responden lo mismo, y aquí se tratan igual: quien llega
 * con un enlace viejo no ha hecho nada malo, y distinguir los casos convertiría la pantalla en
 * una forma de averiguar qué pedidos existen.
 */
export async function getMyOrder(token: string): Promise<MyOrder | null> {
  try {
    return toOrder((await http.get<WireOrder>(`/storefront/orders/${encodeURIComponent(token)}`)).data)
  } catch {
    return null
  }
}

/**
 * Aplica la corrección y devuelve el pedido RELEÍDO por el servidor.
 *
 * Lanza `MyOrderRefused` cuando el servidor dice que no. Se devuelve el pedido entero y no un
 * acuse porque entre pintar y confirmar el mundo pudo moverse: lo que vuelve es la realidad, y
 * es con eso con lo que la vista tiene que resincronizarse.
 */
export async function editMyOrder(token: string, payload: MyOrderEdit): Promise<MyOrder> {
  try {
    const { data } = await http.patch<WireEditResponse>(
      `/storefront/orders/${encodeURIComponent(token)}`,
      payload,
    )
    return toOrder(data.order)
  } catch (error) {
    throw new MyOrderRefused(
      refusalOf(error),
      detailOf(error) ?? 'No pudimos guardar el cambio. Vuelve a intentarlo.',
    )
  }
}
