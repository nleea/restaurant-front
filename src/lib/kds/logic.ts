// KDS prototype — pure derivations. Everything the board shows about state, progress, heat and
// alerts is COMPUTED from component statuses + timers here, so it stays testable and there is one
// source of truth. No Vue, no side effects.

import {
  LATE_AFTER_MIN,
  ORDER_TARGET_MIN,
  SEVERITY_RANK,
  type ItemStatus,
  type KdsItem,
  type KdsOrder,
  type OrderStatus,
  type Severity,
  type Station,
} from './types'

export function minutesSince(ts: number, now: number): number {
  return Math.max(0, Math.floor((now - ts) / 60_000))
}

// ── Item ──────────────────────────────────────────────────────────────────
export function itemDoneCount(item: KdsItem): number {
  return item.components.filter((c) => c.status === 'done').length
}

export function itemStatus(item: KdsItem): ItemStatus {
  const total = item.components.length
  const done = itemDoneCount(item)
  if (done === total) return 'done'
  if (item.components.some((c) => c.status !== 'pending')) return 'cooking'
  return 'pending'
}

// ── Order ─────────────────────────────────────────────────────────────────
export function orderComponents(order: KdsOrder) {
  return order.items.flatMap((i) => i.components)
}

export function orderStatus(order: KdsOrder): OrderStatus {
  if (order.bumpedAt !== null) return 'completed'
  const comps = orderComponents(order)
  if (comps.length > 0 && comps.every((c) => c.status === 'done')) return 'ready'
  if (comps.some((c) => c.status !== 'pending')) return 'in_progress'
  return 'pending'
}

/** 0..1 across ALL components of ALL items. */
export function orderProgress(order: KdsOrder): number {
  const comps = orderComponents(order)
  if (!comps.length) return 0
  return comps.filter((c) => c.status === 'done').length / comps.length
}

export function orderElapsedMin(order: KdsOrder, now: number): number {
  return minutesSince(order.startedAt, now)
}

export function isLate(order: KdsOrder, now: number): boolean {
  return orderStatus(order) !== 'completed' && orderElapsedMin(order, now) > LATE_AFTER_MIN
}

// Time pressure for the footer bar: fresh < 70% of target, warm 70–100%, hot > 100%.
export type TimeHeat = 'fresh' | 'warm' | 'hot'
export function timeHeat(order: KdsOrder, now: number): TimeHeat {
  const ratio = orderElapsedMin(order, now) / ORDER_TARGET_MIN
  if (ratio > 1) return 'hot'
  if (ratio >= 0.7) return 'warm'
  return 'fresh'
}

// ── The "waiting on…" alert ─────────────────────────────────────────────────
// Fires for an item when: (1) ≥1 component Done, (2) ≥1 component still not Done, and (3) a Done
// component has sat longer than its own waitMin (stamped from its station's meta). Severity = how
// many multiples of that
// threshold have passed (1× warn, 2× urgent, 3×+ critical). "waitingStation" is who the plate is
// stuck on — the least-advanced incomplete component (pending outranks cooking).
export interface ItemAlert {
  severity: Severity
  /** station everyone is waiting on to finish the dish. */
  waitingStation: Station
  /** the finished component that is going cold. */
  coldName: string
  coldStation: Station
  /** minutes the cold component has been Done. */
  minutes: number
}

export function itemAlert(item: KdsItem, now: number): ItemAlert | null {
  const done = item.components.filter((c) => c.status === 'done' && c.doneAt !== null)
  const pending = item.components.filter((c) => c.status !== 'done')
  if (!done.length || !pending.length) return null

  // Worst offender: the Done component that has exceeded its threshold by the largest multiple.
  let worst: { comp: (typeof done)[number]; minutes: number; mult: number } | null = null
  for (const comp of done) {
    const minutes = minutesSince(comp.doneAt as number, now)
    const mult = minutes / Math.max(1, comp.waitMin)
    if (mult >= 1 && (!worst || mult > worst.mult)) worst = { comp, minutes, mult }
  }
  if (!worst) return null

  const severity: Severity = worst.mult >= 3 ? 'critical' : worst.mult >= 2 ? 'urgent' : 'warn'
  // Whoever is holding up the plate: prefer a not-started component over an in-progress one.
  const blocker = pending.find((c) => c.status === 'pending') ?? pending[0]
  if (!blocker) return null

  return {
    severity,
    waitingStation: blocker.station,
    coldName: worst.comp.name,
    coldStation: worst.comp.station,
    minutes: worst.minutes,
  }
}

export function orderSeverity(order: KdsOrder, now: number): Severity {
  let worst: Severity = 'none'
  for (const item of order.items) {
    const a = itemAlert(item, now)
    if (a && SEVERITY_RANK[a.severity] > SEVERITY_RANK[worst]) worst = a.severity
  }
  return worst
}

// ── Board-level rollups ─────────────────────────────────────────────────────
/** Active (pending + cooking) component count for a station, across all non-completed orders. */
export function stationActiveCount(orders: KdsOrder[], station: Station): number {
  let n = 0
  for (const o of orders) {
    if (o.bumpedAt !== null) continue
    for (const item of o.items) {
      for (const c of item.components) {
        if (c.station === station && c.status !== 'done') n++
      }
    }
  }
  return n
}

/** Orders that have at least one active component in the station. */
export function stationOrderCount(orders: KdsOrder[], station: Station): number {
  return orders.filter(
    (o) =>
      o.bumpedAt === null &&
      o.items.some((i) => i.components.some((c) => c.station === station && c.status !== 'done')),
  ).length
}

export function stationHasAlert(orders: KdsOrder[], station: Station, now: number): boolean {
  return orders.some(
    (o) =>
      o.bumpedAt === null &&
      o.items.some((i) => {
        const a = itemAlert(i, now)
        return a?.waitingStation === station
      }),
  )
}

export function orderHasStation(order: KdsOrder, station: Station): boolean {
  return order.items.some((i) => i.components.some((c) => c.station === station))
}

// ── Expo feed ────────────────────────────────────────────────────────────────
export interface ExpoRow {
  orderId: string
  table: string
  itemId: string
  itemName: string
  alert: ItemAlert
}

export function expoRows(orders: KdsOrder[], now: number): ExpoRow[] {
  const rows: ExpoRow[] = []
  for (const o of orders) {
    if (o.bumpedAt !== null) continue
    for (const item of o.items) {
      const a = itemAlert(item, now)
      if (a) rows.push({ orderId: o.id, table: o.table, itemId: item.id, itemName: item.name, alert: a })
    }
  }
  return rows.sort((x, y) => SEVERITY_RANK[y.alert.severity] - SEVERITY_RANK[x.alert.severity])
}

export function totalAlertCount(orders: KdsOrder[], now: number): number {
  return expoRows(orders, now).length
}

// Sort for the board: unfinished first (ready/completed sink when visible), then by severity
// (alerted work never buries), then NEWEST first — the last order to reach the kitchen shows
// on top; the alert ladder pulls aging work back up as it escalates.
export function sortOrdersForBoard(orders: KdsOrder[], now: number): KdsOrder[] {
  return [...orders].sort((a, b) => {
    const aDone = orderStatus(a) === 'completed' || orderStatus(a) === 'ready' ? 1 : 0
    const bDone = orderStatus(b) === 'completed' || orderStatus(b) === 'ready' ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    const sev = SEVERITY_RANK[orderSeverity(b, now)] - SEVERITY_RANK[orderSeverity(a, now)]
    if (sev !== 0) return sev
    return b.startedAt - a.startedAt
  })
}

/**
 * Board visibility: fully-ready dockets are hidden until requested ("Listas (N)" toggle) so the
 * pass shows only live work by default. Bumped/completed dockets are treated the same.
 */
export function filterBoardOrders(orders: KdsOrder[], showReady: boolean): KdsOrder[] {
  if (showReady) return orders
  return orders.filter((o) => {
    const status = orderStatus(o)
    return status !== 'ready' && status !== 'completed'
  })
}

/** How many dockets the ready filter is hiding — the toggle's live count. */
export function readyOrderCount(orders: KdsOrder[]): number {
  return orders.filter((o) => {
    const status = orderStatus(o)
    return status === 'ready' || status === 'completed'
  }).length
}
