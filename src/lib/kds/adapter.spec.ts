import { describe, expect, it } from 'vitest'
import type { Ticket } from '@/services/kitchen.api'
import type { ItemInfo } from '@/stores/kitchen'
import { adaptTickets } from './adapter'
import { itemAlert, itemStatus, orderStatus } from './logic'
import type { StationMeta } from './types'

const NOW = 1_700_000_000_000
const MIN = 60_000

const META: ReadonlyMap<string, StationMeta> = new Map([
  ['s1', { id: 's1', tag: 'PA', label: 'Parrilla', waitMin: 6 }],
  ['s2', { id: 's2', tag: 'FR', label: 'Fritura', waitMin: 3 }],
])

function ticket(partial: Partial<Ticket> & { id: string }): Ticket {
  return {
    branch_id: 'b1',
    order_item_id: 'i1',
    kitchen_station_id: 's1',
    status: 'pending',
    entered_at: new Date(NOW - 10 * MIN).toISOString(),
    ready_at: null,
    role: null,
    tasks: [],
    ...partial,
  }
}

const info = (partial: Partial<ItemInfo> = {}): ItemInfo => ({
  label: 'Hamburguesa · Clásica',
  quantity: 2,
  orderId: 'o1',
  channel: 'dine_in',
  tableNumber: '4',
  variantId: 'v1',
  ...partial,
})

describe('adaptTickets — dish components from ticket grouping', () => {
  it('groups an item routed to two stations into one dish with two role-named components', () => {
    const index = { i1: info() }
    const orders = adaptTickets(
      [
        ticket({ id: 't1', kitchen_station_id: 's1', role: 'Parrilla' }),
        ticket({ id: 't2', kitchen_station_id: 's2', role: 'Fritura' }),
      ],
      index,
      META,
      NOW,
    )
    expect(orders).toHaveLength(1)
    const [o] = orders
    expect(o?.items).toHaveLength(1)
    const item = o?.items[0]
    expect(item?.id).toBe('i1')
    expect(item?.name).toBe('Hamburguesa · Clásica')
    expect(item?.variantId).toBe('v1')
    expect(item?.components.map((c) => c.name)).toEqual(['Parrilla', 'Fritura'])
    expect(item?.components.map((c) => c.station)).toEqual(['s1', 's2'])
  })

  it('passes the ticket task list through to the component (empty by default)', () => {
    const [o] = adaptTickets(
      [
        ticket({ id: 't1', role: 'Parrilla', tasks: ['Carne de hamburguesa', 'Tocineta ahumada'] }),
        ticket({ id: 't2', kitchen_station_id: 's2' }),
      ],
      { i1: info() },
      META,
      NOW,
    )
    const comps = o?.items[0]?.components ?? []
    expect(comps[0]?.tasks).toEqual(['Carne de hamburguesa', 'Tocineta ahumada'])
    expect(comps[1]?.tasks).toEqual([])
  })

  it('falls back to the station label when the ticket has no role', () => {
    const [o] = adaptTickets(
      [ticket({ id: 't1', kitchen_station_id: 's2', role: null })],
      { i1: info() },
      META,
      NOW,
    )
    expect(o?.items[0]?.components[0]?.name).toBe('Fritura')
  })

  it('keeps separate order items as separate dishes in the same docket', () => {
    const index = { i1: info(), i2: info({ label: 'Papas', quantity: 1, variantId: 'v2' }) }
    const [o] = adaptTickets(
      [
        ticket({ id: 't1', order_item_id: 'i1' }),
        ticket({ id: 't2', order_item_id: 'i2', kitchen_station_id: 's2' }),
      ],
      index,
      META,
      NOW,
    )
    expect(o?.items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(o?.items[1]?.qty).toBe(1)
  })

  it('maps ticket statuses onto component statuses and ready_at onto doneAt', () => {
    const readyAt = new Date(NOW - 4 * MIN).toISOString()
    const [o] = adaptTickets(
      [
        ticket({ id: 't1', status: 'pending' }),
        ticket({ id: 't2', status: 'in_progress', kitchen_station_id: 's2' }),
        ticket({ id: 't3', status: 'ready', ready_at: readyAt }),
      ],
      { i1: info() },
      META,
      NOW,
    )
    const comps = o?.items[0]?.components ?? []
    expect(comps.map((c) => c.status)).toEqual(['pending', 'cooking', 'done'])
    expect(comps[2]?.doneAt).toBe(NOW - 4 * MIN)
  })

  it('a dish is done only when all its components are done', () => {
    const readyAt = new Date(NOW - MIN).toISOString()
    const half = adaptTickets(
      [
        ticket({ id: 't1', status: 'ready', ready_at: readyAt }),
        ticket({ id: 't2', status: 'in_progress', kitchen_station_id: 's2' }),
      ],
      { i1: info() },
      META,
      NOW,
    )
    const full = adaptTickets(
      [
        ticket({ id: 't1', status: 'ready', ready_at: readyAt }),
        ticket({ id: 't2', status: 'ready', ready_at: readyAt, kitchen_station_id: 's2' }),
      ],
      { i1: info() },
      META,
      NOW,
    )
    expect(itemStatus(half[0]!.items[0]!)).toBe('cooking')
    expect(orderStatus(half[0]!)).toBe('in_progress')
    expect(itemStatus(full[0]!.items[0]!)).toBe('done')
    expect(orderStatus(full[0]!)).toBe('ready')
  })

  it('fires the cross-station alert: a done component cooling while a sibling is pending', () => {
    // Fritura holds 3 min; its component has been done for 7 → urgent, waiting on Parrilla.
    const [o] = adaptTickets(
      [
        ticket({
          id: 't1',
          kitchen_station_id: 's2',
          role: 'Fritura',
          status: 'ready',
          ready_at: new Date(NOW - 7 * MIN).toISOString(),
        }),
        ticket({ id: 't2', kitchen_station_id: 's1', role: 'Parrilla', status: 'pending' }),
      ],
      { i1: info() },
      META,
      NOW,
    )
    const alert = itemAlert(o!.items[0]!, NOW)
    expect(alert?.severity).toBe('urgent')
    expect(alert?.waitingStation).toBe('s1')
    expect(alert?.coldName).toBe('Fritura')
  })

  it('takes the oldest entered_at as the order startedAt', () => {
    const [o] = adaptTickets(
      [
        ticket({ id: 't1', entered_at: new Date(NOW - 5 * MIN).toISOString() }),
        ticket({
          id: 't2',
          kitchen_station_id: 's2',
          entered_at: new Date(NOW - 12 * MIN).toISOString(),
        }),
      ],
      { i1: info() },
      META,
      NOW,
    )
    expect(o?.startedAt).toBe(NOW - 12 * MIN)
  })

  it('groups an unresolvable item into its own solo docket, short-ref named', () => {
    const orders = adaptTickets(
      [
        ticket({ id: 'abcdef1234', order_item_id: 'ghost' }),
        ticket({ id: 'zzzzzz9999', order_item_id: 'ghost', kitchen_station_id: 's2' }),
      ],
      {},
      META,
      NOW,
    )
    expect(orders).toHaveLength(1)
    expect(orders[0]?.items).toHaveLength(1)
    expect(orders[0]?.items[0]?.name).toBe('#abcdef12')
    expect(orders[0]?.items[0]?.components).toHaveLength(2)
  })

  it('maps channels onto order types (takeaway → takeout)', () => {
    const index = { i1: info({ channel: 'takeaway', tableNumber: null }) }
    const [o] = adaptTickets([ticket({ id: 't1' })], index, META, NOW)
    expect(o?.type).toBe('takeout')
    expect(o?.table).toBe('')
  })

  it('falls back to the default waitMin for stations without meta', () => {
    const [o] = adaptTickets(
      [ticket({ id: 't1', kitchen_station_id: 's-unknown' })],
      { i1: info() },
      META,
      NOW,
    )
    expect(o?.items[0]?.components[0]?.waitMin).toBe(5)
  })
})
