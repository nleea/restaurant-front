// Floor view-model: derive each dining table's live state from the real orders.
// A table is occupied when it currently backs an open order; the card reads that
// order's server-computed total. Pure and framework-free so it is unit-testable.
import type { DiningTable, KitchenState, Order } from '@/services/orders.api'
import type { OrderProgress } from '@/lib/kitchenProgress'

/** Backend status string for an order that is still open/active. */
export const OPEN_ORDER_STATUS = 'open'

export interface TableVM {
  table: DiningTable
  /**
   * La PRIMERA comanda abierta de la mesa. Se conserva porque el panel de detalle sigue
   * trabajando sobre una sola, pero desde el pedido por QR una mesa puede sostener varias:
   * para contar, sumar o nombrar comensales hay que usar `openOrders`.
   */
  openOrder: Order | null
  /** Todas las comandas abiertas de la mesa. Una por comensal cuando piden por el QR. */
  openOrders: Order[]
  isOccupied: boolean
  /**
   * Suma de TODAS las comandas abiertas de la mesa.
   *
   * Antes leía sólo la primera, que era correcto cuando una mesa sostenía una comanda. Con
   * varias, la tarjeta decía la cuenta de un comensal y el cajero cobraba otra cosa.
   */
  total: number
  /** Los comensales que la mesa sostiene, para poder nombrarlos en la tarjeta. */
  dinerNames: string[]
  /** Kitchen rollup state of the backing order (`none` when free/unrouted). */
  kitchenState: KitchenState
  /** Client-derived ticket progress for the backing order, or null when kitchen data isn't loaded. */
  progress: OrderProgress | null
}

export function openOrdersForTable(orders: Order[], tableId: string): Order[] {
  return orders.filter((o) => o.dining_table_id === tableId && o.status === OPEN_ORDER_STATUS)
}

export function openOrderForTable(orders: Order[], tableId: string): Order | null {
  return openOrdersForTable(orders, tableId)[0] ?? null
}

/**
 * Build a view-model per active table, sorted by table number for a stable grid. `progressByOrder`
 * (from `buildOrderProgress`) is optional: when kitchen tickets aren't loaded the cards degrade to
 * plain occupied/total.
 */
export function buildTableVMs(
  tables: DiningTable[],
  orders: Order[],
  progressByOrder: Readonly<Record<string, OrderProgress>> = {},
): TableVM[] {
  return tables
    .filter((t) => t.is_active)
    .map((t): TableVM => {
      const openOrders = openOrdersForTable(orders, t.id)
      const openOrder = openOrders[0] ?? null
      return {
        table: t,
        openOrder,
        openOrders,
        isOccupied: openOrders.length > 0,
        total: openOrders.reduce((sum, o) => sum + Number(o.total), 0),
        dinerNames: openOrders
          .map((o) => o.diner_name)
          .filter((name): name is string => !!name),
        kitchenState: openOrder?.kitchen_state ?? 'none',
        progress: openOrder ? (progressByOrder[openOrder.id] ?? null) : null,
      }
    })
    .sort((a, b) => a.table.number.localeCompare(b.table.number, undefined, { numeric: true }))
}

export function occupancyCounts(vms: TableVM[]): { total: number; free: number; occupied: number } {
  const occupied = vms.filter((v) => v.isOccupied).length
  return { total: vms.length, free: vms.length - occupied, occupied }
}
