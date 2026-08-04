import { defineStore } from 'pinia'
import { baseURL } from '@/lib/http'
import { createLiveRefetch, type LiveRefetch } from '@/composables/useLiveRefetch'
import * as api from '@/services/delivery.api'
import type { CreateDeliveryInput, CreateRunInput, Delivery, Run } from '@/services/delivery.api'
import { getOpenSession } from '@/services/cash.api'

// Live-refetch handle (module-level plumbing, like the poll/SSE state in stores/kitchen.ts).
let live: LiveRefetch | undefined

interface DispatchState {
  deliveries: Delivery[]
  runs: Run[]
  // The branch these collections were loaded for. Held because the write-through refetches
  // carry no branch of their own — see `refetch*` below.
  branchId: string | null
  selectedDeliveryId: string | null
  selectedRunId: string | null
  // Whether the loaded branch has an open cash session. The board scopes to the open shift, so an
  // empty list means "caja cerrada" (no shift) vs "no deliveries yet" — this disambiguates them.
  cashSessionOpen: boolean
}

// Operational dispatch: per-order deliveries and dispatch runs with a two-entity lifecycle. The
// list endpoints are branch-scoped, like the routes beside them. Write-through discipline: every
// mutation refetches the affected collection(s) so server state — including cascaded transitions
// (depart moves a run and its deliveries) — is shown verbatim. Route/driver/order labels are
// resolved by the components from the delivery, staff and orders stores.
export const useDispatchStore = defineStore('dispatch', {
  state: (): DispatchState => ({
    deliveries: [],
    runs: [],
    branchId: null,
    selectedDeliveryId: null,
    selectedRunId: null,
    cashSessionOpen: true,
  }),

  getters: {
    selectedDelivery: (state): Delivery | null =>
      state.deliveries.find((d) => d.id === state.selectedDeliveryId) ?? null,
    selectedRun: (state): Run | null =>
      state.runs.find((r) => r.id === state.selectedRunId) ?? null,

    deliveriesByStatus:
      (state) =>
      (status: string): Delivery[] =>
        state.deliveries.filter((d) => d.delivery_status === status),
    runsByStatus:
      (state) =>
      (status: string): Run[] =>
        state.runs.filter((r) => r.status === status),

    // A run's assigned deliveries (grouped via delivery_run_id), ordered as stops:
    // by route_position when set, then by creation time.
    deliveriesOfRun:
      (state) =>
      (runId: string): Delivery[] =>
        state.deliveries
          .filter((d) => d.delivery_run_id === runId)
          .sort(
            (a, b) =>
              (a.route_position ?? Number.MAX_SAFE_INTEGER) -
                (b.route_position ?? Number.MAX_SAFE_INTEGER) ||
              (a.created_at ?? '').localeCompare(b.created_at ?? ''),
          ),

    // Stop-strip progress for a run's card and detail.
    runProgress:
      (state) =>
      (runId: string): { delivered: number; total: number } => {
        const stops = state.deliveries.filter((d) => d.delivery_run_id === runId)
        return {
          delivered: stops.filter((d) => d.delivery_status === 'delivered').length,
          total: stops.length,
        }
      },

    // Deliveries available to assign, and runs that can receive them.
    //
    // "Available" means the kitchen finished: handing a courier food that is still cooking is
    // how an order gets marked delivered before it was ever plated. The board still SHOWS the
    // others (blocked, with their reason) — they just never reach a run picker.
    pendingDeliveries: (state): Delivery[] =>
      state.deliveries.filter(
        (d) => d.delivery_status === 'pending' && d.kitchen_state === 'ready',
      ),
    /** Pending but still cooking — shown on the board so the dispatcher can plan ahead. */
    notReadyDeliveries: (state): Delivery[] =>
      state.deliveries.filter(
        (d) => d.delivery_status === 'pending' && d.kitchen_state !== 'ready',
      ),
    preparingRuns: (state): Run[] => state.runs.filter((r) => r.status === 'preparing'),
  },

  actions: {
    async loadDeliveries(branchId: string, status?: string): Promise<void> {
      this.branchId = branchId
      // Scope to the open shift, and learn whether a caja is open (404 = closed) so the board can
      // tell "caja cerrada" apart from an empty shift.
      this.cashSessionOpen = await getOpenSession(branchId).then(
        () => true,
        () => false,
      )
      this.deliveries = await api.listDeliveries(branchId, status, true)
    },
    async loadRuns(branchId: string, status?: string): Promise<void> {
      this.branchId = branchId
      this.runs = await api.listRuns(branchId, status)
    },

    // The write-through refetches below carry no branch of their own, so they reuse the one
    // the store was loaded for. With none loaded they do nothing — a mutation cannot happen
    // before a load, and a no-op beats falling back to a tenant-wide fetch.
    async refetchDeliveries(): Promise<void> {
      if (this.branchId) this.deliveries = await api.listDeliveries(this.branchId, undefined, true)
    },
    async refetchRuns(): Promise<void> {
      if (this.branchId) this.runs = await api.listRuns(this.branchId)
    },

    // --- Create (write-through) ----------------------------------------------
    async createDelivery(input: CreateDeliveryInput): Promise<Delivery> {
      const delivery = await api.createDelivery(input)
      await this.refetchDeliveries()
      return delivery
    },
    async createRun(input: CreateRunInput): Promise<Run> {
      const run = await api.createRun(input)
      await this.refetchRuns()
      return run
    },

    // --- Edit (write-through) --------------------------------------------------
    async updateDeliveryNotes(deliveryId: string, notes: string | null): Promise<void> {
      await api.updateDelivery(deliveryId, { notes })
      await this.refetchDeliveries()
    },
    async updateDeliveryLocation(
      deliveryId: string,
      latitude: string,
      longitude: string,
    ): Promise<void> {
      await api.updateDelivery(deliveryId, { latitude, longitude })
      await this.refetchDeliveries()
    },

    // --- Lifecycle (write-through) -------------------------------------------
    async assignDelivery(deliveryId: string, runId: string): Promise<void> {
      await api.assignDelivery(deliveryId, { delivery_run_id: runId })
      await this.refetchDeliveries()
    },
    // Departing cascades a run's assigned deliveries to in_transit, so refetch both lists.
    async departRun(runId: string): Promise<void> {
      await api.departRun(runId)
      await Promise.all([this.refetchRuns(), this.refetchDeliveries()])
    },
    async markDelivered(deliveryId: string, delivered: boolean): Promise<void> {
      await api.markDelivered(deliveryId, delivered)
      await this.refetchDeliveries()
    },
    async finishRun(runId: string): Promise<void> {
      await api.finishRun(runId)
      await this.refetchRuns()
    },

    // --- Live board (SSE doorbell → debounced refetch, polling fallback) -------
    // The board subscribes to the branch's `delivery` stream; each event just refetches the two
    // collections (write-through refetches reuse the loaded branch). Start on view mount, stop on
    // unmount — no leaked stream or timer.
    startLive(branchId: string): void {
      this.stopLive()
      live = createLiveRefetch({
        url: `${baseURL}/delivery/events?branch_id=${branchId}`,
        onDoorbell: async () => {
          await Promise.all([this.refetchDeliveries(), this.refetchRuns()])
        },
      })
      live.start()
    },
    stopLive(): void {
      live?.stop()
      live = undefined
    },
  },
})
