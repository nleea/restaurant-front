// Order-level kitchen readiness, derived purely from the station tickets (the source of truth) —
// there is no per-order ticket count or "ready timestamp" on the backend, so the Salón/Dispatch
// surfaces compute progress and the cooling timer client-side from each ticket's `ready_at`.
// Pure and framework-free so it is unit-testable.
import { parseTs } from '@/lib/kitchenTime'

/** The subset of a ticket this rollup needs; keeps the helper decoupled from the API type. */
export interface ProgressTicket {
  order_item_id: string
  status: string
  ready_at: string | null
}

export interface OrderProgress {
  /** Tickets belonging to the order (across all stations). */
  total: number
  /** Tickets already `ready`. */
  ready: number
  /**
   * Epoch ms of the newest `ready_at` once *every* ticket is ready (the moment the order was fully
   * up), or null while any ticket is still cooking / no timestamp is available.
   */
  readySinceMs: number | null
}

/**
 * Roll up per-order kitchen progress from tickets + an `order_item_id → orderId` index. Tickets
 * whose item isn't in the index (e.g. a closed order still on the board) are ignored, so the map
 * only covers orders we can attribute. Orders with no tickets simply don't appear.
 */
export function buildOrderProgress(
  tickets: ReadonlyArray<ProgressTicket>,
  itemOrderIndex: Readonly<Record<string, string>>,
): Record<string, OrderProgress> {
  interface Acc {
    total: number
    ready: number
    maxReadyMs: number | null
    allReady: boolean
  }
  const acc: Record<string, Acc> = {}
  for (const t of tickets) {
    const orderId = itemOrderIndex[t.order_item_id]
    if (!orderId) continue
    const a = (acc[orderId] ??= { total: 0, ready: 0, maxReadyMs: null, allReady: true })
    a.total += 1
    if (t.status === 'ready') {
      a.ready += 1
      const ms = parseTs(t.ready_at)
      if (ms !== null && (a.maxReadyMs === null || ms > a.maxReadyMs)) a.maxReadyMs = ms
    } else {
      a.allReady = false
    }
  }
  const out: Record<string, OrderProgress> = {}
  for (const [orderId, a] of Object.entries(acc)) {
    out[orderId] = {
      total: a.total,
      ready: a.ready,
      readySinceMs: a.allReady && a.total > 0 ? a.maxReadyMs : null,
    }
  }
  return out
}
