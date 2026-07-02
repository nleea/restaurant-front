import { describe, expect, it } from 'vitest'
import {
  expoRows,
  filterBoardOrders,
  itemAlert,
  orderProgress,
  orderSeverity,
  orderStatus,
  readyOrderCount,
  sortOrdersForBoard,
  stationActiveCount,
  timeHeat,
} from './logic'
import type { ComponentStatus, KdsComponent, KdsItem, KdsOrder, Station } from './types'

const NOW = 1_700_000_000_000
const MIN = 60_000

// Mock station hold thresholds (minutes) — stamped onto each component like the adapter/seed do.
const WAIT_MIN: Record<string, number> = { GRILL: 6, FRYER: 3, COLD: 5, BAR: 4 }

let seq = 0
function c(station: Station, status: ComponentStatus, doneMinAgo?: number): KdsComponent {
  return {
    id: `c${++seq}`,
    name: `${station}-${status}`,
    station,
    status,
    tasks: [],
    doneAt: status === 'done' ? NOW - (doneMinAgo ?? 0) * MIN : null,
    waitMin: WAIT_MIN[station] ?? 5,
  }
}
function item(components: KdsComponent[]): KdsItem {
  return {
    id: `i${++seq}`,
    qty: 1,
    name: 'Dish',
    modifiers: [],
    components,
    recipe: { photoLabel: '', ingredients: [], allergens: [], steps: [] },
  }
}
function order(items: KdsItem[], startedMinAgo = 10, bumped = false): KdsOrder {
  return {
    id: `ORD${++seq}00`,
    table: 'T1',
    guests: 2,
    type: 'dinein',
    waiter: 'Ana',
    startedAt: NOW - startedMinAgo * MIN,
    bumpedAt: bumped ? NOW : null,
    items,
  }
}

describe('order + item status', () => {
  it('is pending when nothing has started', () => {
    expect(orderStatus(order([item([c('GRILL', 'pending'), c('COLD', 'pending')])]))).toBe('pending')
  })
  it('is in_progress when at least one component moved', () => {
    expect(orderStatus(order([item([c('GRILL', 'cooking'), c('COLD', 'pending')])]))).toBe('in_progress')
  })
  it('is ready only when every component across every item is done', () => {
    expect(orderStatus(order([item([c('GRILL', 'done'), c('COLD', 'done')])]))).toBe('ready')
  })
  it('completed wins regardless of components', () => {
    expect(orderStatus(order([item([c('GRILL', 'pending')])], 10, true))).toBe('completed')
  })
  it('progress counts done across all items', () => {
    const o = order([item([c('GRILL', 'done'), c('COLD', 'pending')]), item([c('FRYER', 'done'), c('BAR', 'done')])])
    expect(orderProgress(o)).toBeCloseTo(3 / 4)
  })
})

describe('waiting-on alert severity', () => {
  it('does not fire without a done component', () => {
    expect(itemAlert(item([c('GRILL', 'cooking'), c('COLD', 'pending')]), NOW)).toBeNull()
  })
  it('does not fire once everything is done', () => {
    expect(itemAlert(item([c('GRILL', 'done', 30), c('COLD', 'done', 30)]), NOW)).toBeNull()
  })
  it('warns at 1x the station threshold (FRYER holds 3 min)', () => {
    const a = itemAlert(item([c('FRYER', 'done', 4), c('COLD', 'pending')]), NOW)
    expect(a?.severity).toBe('warn')
    expect(a?.waitingStation).toBe('COLD')
    expect(a?.minutes).toBe(4)
  })
  it('escalates to urgent at 2x and critical at 3x', () => {
    expect(itemAlert(item([c('FRYER', 'done', 7), c('GRILL', 'pending')]), NOW)?.severity).toBe('urgent')
    expect(itemAlert(item([c('FRYER', 'done', 10), c('GRILL', 'pending')]), NOW)?.severity).toBe('critical')
  })
  it('holds its fire while a Done component is still within threshold (GRILL holds 6 min)', () => {
    expect(itemAlert(item([c('GRILL', 'done', 3), c('COLD', 'pending')]), NOW)).toBeNull()
  })
  it('prefers a not-started blocker over an in-progress one', () => {
    const a = itemAlert(item([c('FRYER', 'done', 5), c('GRILL', 'cooking'), c('COLD', 'pending')]), NOW)
    expect(a?.waitingStation).toBe('COLD')
  })
})

describe('board rollups', () => {
  it('counts only active (not-done) components per station', () => {
    const orders = [order([item([c('GRILL', 'cooking'), c('GRILL', 'done', 1), c('FRYER', 'pending')])])]
    expect(stationActiveCount(orders, 'GRILL')).toBe(1)
    expect(stationActiveCount(orders, 'FRYER')).toBe(1)
  })
  it('sorts expo critical → warn', () => {
    const orders = [
      order([item([c('FRYER', 'done', 4), c('COLD', 'pending')])]), // warn
      order([item([c('FRYER', 'done', 10), c('GRILL', 'pending')])]), // critical
    ]
    const rows = expoRows(orders, NOW)
    expect(rows.map((r) => r.alert.severity)).toEqual(['critical', 'warn'])
  })
  it('ranks the most severe order first on the board', () => {
    const calm = order([item([c('GRILL', 'cooking')])], 5)
    const hot = order([item([c('FRYER', 'done', 10), c('GRILL', 'pending')])], 25)
    expect(sortOrdersForBoard([calm, hot], NOW)[0]?.id).toBe(hot.id)
    expect(orderSeverity(hot, NOW)).toBe('critical')
  })
  it('orders newest-first within equal severity, alerts still on top', () => {
    const justFired = order([item([c('GRILL', 'pending')])], 2)
    const olderCalm = order([item([c('GRILL', 'cooking')])], 15)
    const oldUrgent = order([item([c('FRYER', 'done', 7), c('GRILL', 'pending')])], 30)
    const sorted = sortOrdersForBoard([olderCalm, justFired, oldUrgent], NOW)
    expect(sorted.map((o) => o.id)).toEqual([oldUrgent.id, justFired.id, olderCalm.id])
  })

  it('sinks fully-ready dockets below unfinished work when visible', () => {
    const ready = order([item([c('GRILL', 'done', 1)])], 5)
    const cooking = order([item([c('GRILL', 'cooking')])], 20)
    expect(sortOrdersForBoard([ready, cooking], NOW)[0]?.id).toBe(cooking.id)
  })

  it('hides ready dockets behind the filter and counts them for the toggle', () => {
    const ready = order([item([c('GRILL', 'done', 1)])], 5)
    const cooking = order([item([c('GRILL', 'cooking')])], 10)
    expect(filterBoardOrders([ready, cooking], false).map((o) => o.id)).toEqual([cooking.id])
    expect(filterBoardOrders([ready, cooking], true)).toHaveLength(2)
    expect(readyOrderCount([ready, cooking])).toBe(1)
  })

  it('reads time heat off the 20-min target', () => {
    expect(timeHeat(order([item([c('GRILL', 'cooking')])], 5), NOW)).toBe('fresh')
    expect(timeHeat(order([item([c('GRILL', 'cooking')])], 16), NOW)).toBe('warm')
    expect(timeHeat(order([item([c('GRILL', 'cooking')])], 25), NOW)).toBe('hot')
  })
})
