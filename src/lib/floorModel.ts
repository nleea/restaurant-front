// Floor view-model: derive each dining table's live state from the real orders.
// A table is occupied when it currently backs an open order; the card reads that
// order's server-computed total. Pure and framework-free so it is unit-testable.
import type { DiningTable, KitchenState, Order } from '@/services/orders.api'
import type { OrderProgress } from '@/lib/kitchenProgress'

/** Backend status string for an order that is still open/active. */
export const OPEN_ORDER_STATUS = 'open'

export interface TableVM {
  table: DiningTable
  openOrder: Order | null
  isOccupied: boolean
  /** Server total of the open order (numeric), or 0 when free. */
  total: number
  /** Kitchen rollup state of the backing order (`none` when free/unrouted). */
  kitchenState: KitchenState
  /** Client-derived ticket progress for the backing order, or null when kitchen data isn't loaded. */
  progress: OrderProgress | null
}

export function openOrderForTable(orders: Order[], tableId: string): Order | null {
  return (
    orders.find((o) => o.dining_table_id === tableId && o.status === OPEN_ORDER_STATUS) ?? null
  )
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
      const openOrder = openOrderForTable(orders, t.id)
      return {
        table: t,
        openOrder,
        isOccupied: openOrder !== null,
        total: openOrder ? Number(openOrder.total) : 0,
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
