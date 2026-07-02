// Adapter: real kitchen tickets → the KDS view model. This is the single seam between the
// backend shape (one ticket per order_item × station, labels resolved via the store's item
// index) and the KDS components. Routing fans out one ticket per station mapped to the dish's
// product, so a dish IS its group of tickets: one KdsItem per order_item, one component per
// ticket, component named by the ticket's `role` (falling back to the station's label).
//
// Field mapping:
//   ticket.status  pending|in_progress|ready → component pending|cooking|done
//   ticket.role ?? station label → component name
//   ticket.entered_at → order startedAt (min across the order's tickets)
//   ticket.ready_at   → component doneAt (feeds the "getting cold" alert clock)
//   itemIndex[order_item_id] → label, quantity, variant, table, channel (degrades to a short ref)
// Not available on real tickets (rendered empty): guests, waiter, modifiers, bumpedAt.

import type { Ticket } from '@/services/kitchen.api'
import type { ItemInfo } from '@/stores/kitchen'
import { DEFAULT_WAIT_MIN } from './stations'
import type { ComponentStatus, KdsItem, KdsOrder, OrderType, StationMeta } from './types'

const STATUS_MAP: Record<string, ComponentStatus> = {
  pending: 'pending',
  in_progress: 'cooking',
  ready: 'done',
}

const CHANNEL_MAP: Record<string, OrderType> = {
  dine_in: 'dinein',
  takeaway: 'takeout',
  delivery: 'delivery',
}

function toMs(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

function shortRef(ticket: Ticket): string {
  return `#${ticket.id.slice(0, 8)}`
}

/**
 * Group real tickets into KDS orders. `now` is only the fallback `startedAt` for tickets that
 * carry no `entered_at` (so a fresh docket reads "0 min", never NaN). Pure: no clock, no store.
 */
export function adaptTickets(
  tickets: Ticket[],
  itemIndex: Record<string, ItemInfo>,
  metaById: ReadonlyMap<string, StationMeta>,
  now: number,
): KdsOrder[] {
  // Deterministic input order so dockets don't shuffle between polls (tickets arrive grouped by
  // station, in whatever order the fan-out resolved).
  const sorted = [...tickets].sort((a, b) => {
    const at = toMs(a.entered_at) ?? now
    const bt = toMs(b.entered_at) ?? now
    return at - bt || a.id.localeCompare(b.id)
  })

  const orders = new Map<string, KdsOrder>()
  // One dish per order_item across its N station tickets; keyed globally since item ids are uuids.
  const itemsById = new Map<string, KdsItem>()
  for (const ticket of sorted) {
    const info: ItemInfo | undefined = itemIndex[ticket.order_item_id]
    const resolved = !!info && info.label !== '—'
    // Unresolvable items still group their own tickets: key by the item, not the ticket.
    const key = info?.orderId ?? `solo:${ticket.order_item_id}`
    const enteredAt = toMs(ticket.entered_at) ?? now

    let order = orders.get(key)
    if (!order) {
      order = {
        id: info?.orderId ?? ticket.order_item_id,
        table: info?.tableNumber ?? '',
        guests: 0,
        type: CHANNEL_MAP[info?.channel ?? ''] ?? 'dinein',
        waiter: '',
        startedAt: enteredAt,
        bumpedAt: null,
        items: [],
      }
      orders.set(key, order)
    }
    order.startedAt = Math.min(order.startedAt, enteredAt)

    const label = resolved ? info.label : shortRef(ticket)
    let item = itemsById.get(ticket.order_item_id)
    if (!item) {
      item = {
        id: ticket.order_item_id,
        qty: resolved ? info.quantity : 1,
        name: label,
        modifiers: [],
        components: [],
        variantId: info?.variantId ?? null,
      }
      itemsById.set(ticket.order_item_id, item)
      order.items.push(item)
    }

    const status = STATUS_MAP[ticket.status] ?? 'pending'
    item.components.push({
      id: ticket.id,
      // The cook's shorthand for what this station owes the dish ("Parrilla", "Fríos").
      name: ticket.role ?? metaById.get(ticket.kitchen_station_id)?.label ?? label,
      station: ticket.kitchen_station_id,
      status,
      tasks: ticket.tasks ?? [],
      doneAt: status === 'done' ? (toMs(ticket.ready_at) ?? now) : null,
      waitMin: metaById.get(ticket.kitchen_station_id)?.waitMin ?? DEFAULT_WAIT_MIN,
    })
  }

  return [...orders.values()]
}
