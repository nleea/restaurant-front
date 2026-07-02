import { defineStore } from 'pinia'
import { baseURL } from '@/lib/http'
import { createSseClient, type SseClient } from '@/lib/sse'
import { getAccessToken } from '@/lib/tokens'
import * as api from '@/services/kitchen.api'
import { TICKET_STATUSES } from '@/services/kitchen.api'
import type { KitchenStation, ProductStation, Ticket, TicketStatus } from '@/services/kitchen.api'
import { useOrdersStore } from '@/stores/orders'

export interface ItemInfo {
  label: string
  quantity: number
  orderId: string | null
  channel: string | null
  tableNumber: string | null
  /** Product variant behind the item — lets the KDS fetch the dish's recipe card. */
  variantId: string | null
}

// One order's tickets at a station — the unit the board renders as a docket.
export interface OrderDocket {
  key: string
  orderId: string | null
  channel: string | null
  tableNumber: string | null
  tickets: Ticket[]
}

interface KitchenState {
  stations: KitchenStation[]
  selectedStationId: string | null
  ticketsByStation: Record<string, Ticket[]>
  // product_id → its station mappings (loaded on demand for the setup UI).
  stationsByProduct: Record<string, ProductStation[]>
  // order_item_id → product/variant label, quantity, and order context (table/channel), resolved
  // from the menu + open orders so a ticket (which carries only order_item_id) shows a full chit.
  itemIndex: Record<string, ItemInfo>
}

// Poll timer + in-flight guard live at module level (the store is a singleton); they are process
// plumbing, not board state, so they stay out of Pinia's reactive graph.
let pollTimer: ReturnType<typeof setInterval> | undefined
let pollInFlight = false

/** Board auto-refresh cadence — a wall KDS must stay current without anyone touching it. */
export const POLL_INTERVAL_MS = 10_000
/** Cadence while the SSE stream is healthy: polling is only a safety net then. */
export const POLL_RELAXED_MS = 60_000
/** Events arriving within this window collapse into one refetch. */
export const EVENT_DEBOUNCE_MS = 300

// SSE plumbing (same module-level rationale as the poll timer).
let sseClient: SseClient | undefined
let eventDebounce: ReturnType<typeof setTimeout> | undefined
let pendingFull = false
const pendingStations = new Set<string>()

interface KitchenEventPayload {
  type?: string
  station_id?: string
}

// Write-through discipline (as in the orders store): every mutation calls the API then refetches
// the affected collection so the board reflects server state verbatim.
export const useKitchenStore = defineStore('kitchen', {
  state: (): KitchenState => ({
    stations: [],
    selectedStationId: null,
    ticketsByStation: {},
    stationsByProduct: {},
    itemIndex: {},
  }),

  getters: {
    selectedStation: (state): KitchenStation | null =>
      state.stations.find((s) => s.id === state.selectedStationId) ?? null,
    // Every loaded ticket across stations — the input to the order-level ready rollup.
    allTickets: (state): Ticket[] => Object.values(state.ticketsByStation).flat(),
    // order_item_id → orderId, derived from the item index the board already builds.
    itemOrderIndex: (state): Record<string, string> => {
      const index: Record<string, string> = {}
      for (const [itemId, info] of Object.entries(state.itemIndex)) {
        if (info.orderId) index[itemId] = info.orderId
      }
      return index
    },
    ticketsOf:
      (state) =>
      (stationId: string): Ticket[] =>
        state.ticketsByStation[stationId] ?? [],
    // Tickets not yet done (pending + in_progress) — the live backlog shown on the station rail.
    openCountOf:
      (state) =>
      (stationId: string): number =>
        (state.ticketsByStation[stationId] ?? []).filter((t) => t.status !== 'ready').length,
    stationsForProduct:
      (state) =>
      (productId: string): ProductStation[] =>
        state.stationsByProduct[productId] ?? [],
    // A ticket carries only order_item_id; resolve label + quantity, degrading to a short ref.
    ticketInfo:
      (state) =>
      (ticket: Ticket): { label: string; quantity: number } => {
        const info = state.itemIndex[ticket.order_item_id]
        if (!info || info.label === '—') return { label: `#${ticket.id.slice(0, 8)}`, quantity: 1 }
        return { label: info.label, quantity: info.quantity }
      },
    ticketLabel:
      (state) =>
      (ticket: Ticket): string => {
        const info = state.itemIndex[ticket.order_item_id]
        if (!info || info.label === '—') return `#${ticket.id.slice(0, 8)}`
        return `${info.label} ×${info.quantity}`
      },
    // Group a station's tickets into per-order dockets (the board's unit of work).
    orderDockets:
      (state) =>
      (stationId: string): OrderDocket[] => {
        const map = new Map<string, OrderDocket>()
        for (const ticket of state.ticketsByStation[stationId] ?? []) {
          const info = state.itemIndex[ticket.order_item_id]
          const key = info?.orderId ?? `solo:${ticket.id}`
          let docket = map.get(key)
          if (!docket) {
            docket = {
              key,
              orderId: info?.orderId ?? null,
              channel: info?.channel ?? null,
              tableNumber: info?.tableNumber ?? null,
              tickets: [],
            }
            map.set(key, docket)
          }
          docket.tickets.push(ticket)
        }
        return [...map.values()]
      },
    // Group a station's tickets into the three board columns, preserving order within each.
    columns:
      (state) =>
      (stationId: string): Record<TicketStatus, Ticket[]> => {
        const cols = { pending: [], in_progress: [], ready: [] } as Record<TicketStatus, Ticket[]>
        for (const ticket of state.ticketsByStation[stationId] ?? []) {
          if ((TICKET_STATUSES as readonly string[]).includes(ticket.status)) {
            cols[ticket.status as TicketStatus].push(ticket)
          }
        }
        return cols
      },
  },

  actions: {
    async loadStations(branchId: string): Promise<void> {
      this.stations = await api.listStations(branchId)
    },

    async loadTickets(stationId: string): Promise<void> {
      this.ticketsByStation[stationId] = await api.listTickets(stationId)
    },

    // Load every station's tickets so the rail can show live backlog counts.
    async loadAllStationTickets(): Promise<void> {
      await Promise.all(this.stations.map((s) => this.loadTickets(s.id)))
    },

    // One polling tick: refresh every station's tickets, and rebuild the label index only when a
    // ticket arrived for an order item we can't resolve yet (a newly routed order). A failed tick
    // keeps the last good data and lets the next tick retry.
    async pollBoard(branchId: string): Promise<void> {
      if (pollInFlight) return
      pollInFlight = true
      try {
        await this.loadAllStationTickets()
        if (this.allTickets.some((t) => !this.itemIndex[t.order_item_id])) {
          await this.buildItemIndex(branchId)
        }
      } catch {
        // keep showing the last good board; the next tick retries
      } finally {
        pollInFlight = false
      }
    },

    // The board starts/stops this on mount/unmount. Ticks are skipped while a previous fetch is
    // still in flight and while the tab is hidden (a hidden wall screen shouldn't hammer the API).
    startPolling(branchId: string, intervalMs: number = POLL_INTERVAL_MS): void {
      this.stopPolling()
      pollTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return
        void this.pollBoard(branchId)
      }, intervalMs)
    },

    stopPolling(): void {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = undefined
    },

    // Live board: subscribe to the branch's kitchen events (SSE). Events drive debounced
    // refetches — station-targeted for advances, whole board (with label-index rebuild) for
    // newly routed tickets. While the stream is healthy, polling relaxes to a safety net; when
    // it drops, the client reconnects with backoff and polling returns to the full cadence.
    startEvents(branchId: string): void {
      this.stopEvents()
      const flush = (): void => {
        eventDebounce = undefined
        const full = pendingFull
        const stations = [...pendingStations]
        pendingFull = false
        pendingStations.clear()
        if (full) {
          void this.pollBoard(branchId)
        } else {
          void Promise.all(stations.map((s) => this.loadTickets(s).catch(() => undefined)))
        }
      }
      const client = createSseClient({
        url: `${baseURL}/kitchen/events?branch_id=${branchId}`,
        getToken: getAccessToken,
        onEvent: (data) => {
          const event = data as KitchenEventPayload
          // New tickets can belong to orders the label index doesn't know yet → full refresh.
          if (event.type === 'ticket_created' || !event.station_id) pendingFull = true
          else pendingStations.add(event.station_id)
          if (eventDebounce) clearTimeout(eventDebounce)
          eventDebounce = setTimeout(flush, EVENT_DEBOUNCE_MS)
        },
        onStateChange: (connected) => {
          if (sseClient !== client) return // stale client (stopped/replaced): don't touch polling
          this.startPolling(branchId, connected ? POLL_RELAXED_MS : POLL_INTERVAL_MS)
        },
      })
      sseClient = client
      client.start()
    },

    stopEvents(): void {
      const client = sseClient
      sseClient = undefined
      client?.stop()
      if (eventDebounce) clearTimeout(eventDebounce)
      eventDebounce = undefined
      pendingFull = false
      pendingStations.clear()
    },

    async selectStation(stationId: string): Promise<void> {
      this.selectedStationId = stationId
      await this.loadTickets(stationId)
    },

    async createStation(branchId: string, name: string, position: number): Promise<void> {
      await api.createStation({ branch_id: branchId, name, position })
      await this.loadStations(branchId)
    },

    async updateStation(
      branchId: string,
      stationId: string,
      patch: Partial<{ name: string; position: number; is_active: boolean }>,
    ): Promise<void> {
      await api.updateStation(stationId, patch)
      await this.loadStations(branchId)
    },

    async loadProductStations(productId: string): Promise<void> {
      this.stationsByProduct[productId] = await api.listProductStations(productId)
    },

    async attachProduct(
      productId: string,
      stationId: string,
      role?: string | null,
    ): Promise<void> {
      await api.attachProductStation({
        product_id: productId,
        kitchen_station_id: stationId,
        role: role ?? null,
      })
      await this.loadProductStations(productId)
    },

    async detachProduct(productId: string, stationId: string): Promise<void> {
      await api.detachProductStation(productId, stationId)
      await this.loadProductStations(productId)
    },

    // Edit a mapping's role/tasks in place. Fired tickets keep their frozen copies; only
    // orders routed after the edit carry the new values.
    async updateMapping(
      productId: string,
      mappingId: string,
      patch: Partial<{ role: string | null; tasks: string[] }>,
    ): Promise<void> {
      await api.updateProductStation(mappingId, patch)
      await this.loadProductStations(productId)
    },

    // Routing is idempotent on the backend; the board shows every station, so refresh them all
    // so the new tickets appear wherever they were routed.
    async routeOrder(orderId: string): Promise<void> {
      await api.routeOrder(orderId)
      await this.loadAllStationTickets()
    },

    // Write-through: the advance response says which station the ticket lives on — refetch that
    // station so the board shows server state verbatim without fanning out to every station.
    async advanceTicket(ticketId: string): Promise<void> {
      const updated = await api.advanceTicket(ticketId)
      await this.loadTickets(updated.kitchen_station_id)
    },

    // Bump: advance each given ticket to `ready` (a pending ticket needs two forward steps),
    // holding the refetch until the end so a docket bump is one board refresh, not 2×N.
    async bumpTickets(tickets: { id: string; status: string }[]): Promise<void> {
      try {
        for (const t of tickets) {
          if (t.status === 'ready') continue
          await api.advanceTicket(t.id)
          if (t.status === 'pending') await api.advanceTicket(t.id)
        }
      } finally {
        // Even on partial failure, show exactly what the server holds.
        await this.loadAllStationTickets()
      }
    },

    // Build order_item_id → {label, quantity, order context} from the menu + the branch's open
    // orders, reusing the orders store's variant index and item labeller. Best-effort: items of
    // orders no longer open won't resolve and their tickets fall back to a short ref.
    async buildItemIndex(branchId: string): Promise<void> {
      const orders = useOrdersStore()
      await orders.buildVariantIndex(branchId)
      await orders.loadOrders(branchId, 'open')
      await orders.loadTables(branchId)
      await Promise.all(orders.orders.map((o) => orders.fetchItems(o.id)))
      const tableNumber = (id: string | null): string | null =>
        id ? (orders.tables.find((t) => t.id === id)?.number ?? null) : null
      const index: Record<string, ItemInfo> = {}
      for (const order of orders.orders) {
        for (const item of orders.itemsByOrder[order.id] ?? []) {
          index[item.id] = {
            label: orders.itemLabel(item),
            quantity: item.quantity,
            orderId: order.id,
            channel: order.channel,
            tableNumber: tableNumber(order.dining_table_id),
            variantId: item.product_variant_id ?? null,
          }
        }
      }
      this.itemIndex = index
    },
  },
})
