import { defineStore } from 'pinia'
import * as api from '@/services/delivery.api'
import type { CreateDeliveryInput, CreateRunInput, Delivery, Run } from '@/services/delivery.api'

interface DispatchState {
  deliveries: Delivery[]
  runs: Run[]
  selectedDeliveryId: string | null
  selectedRunId: string | null
}

// Operational dispatch: per-order deliveries and dispatch runs with a two-entity lifecycle. The
// list endpoints are tenant-wide (status only). Write-through discipline: every mutation refetches
// the affected collection(s) so server state — including cascaded transitions (depart moves a run
// and its deliveries) — is shown verbatim. Route/driver/order labels are resolved by the components
// from the delivery, staff and orders stores.
export const useDispatchStore = defineStore('dispatch', {
  state: (): DispatchState => ({
    deliveries: [],
    runs: [],
    selectedDeliveryId: null,
    selectedRunId: null,
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
    pendingDeliveries: (state): Delivery[] =>
      state.deliveries.filter((d) => d.delivery_status === 'pending'),
    preparingRuns: (state): Run[] => state.runs.filter((r) => r.status === 'preparing'),
  },

  actions: {
    async loadDeliveries(status?: string): Promise<void> {
      this.deliveries = await api.listDeliveries(status)
    },
    async loadRuns(status?: string): Promise<void> {
      this.runs = await api.listRuns(status)
    },

    // --- Create (write-through) ----------------------------------------------
    async createDelivery(input: CreateDeliveryInput): Promise<Delivery> {
      const delivery = await api.createDelivery(input)
      await this.loadDeliveries()
      return delivery
    },
    async createRun(input: CreateRunInput): Promise<Run> {
      const run = await api.createRun(input)
      await this.loadRuns()
      return run
    },

    // --- Edit (write-through) --------------------------------------------------
    async updateDeliveryNotes(deliveryId: string, notes: string | null): Promise<void> {
      await api.updateDelivery(deliveryId, { notes })
      await this.loadDeliveries()
    },
    async updateDeliveryLocation(
      deliveryId: string,
      latitude: string,
      longitude: string,
    ): Promise<void> {
      await api.updateDelivery(deliveryId, { latitude, longitude })
      await this.loadDeliveries()
    },

    // --- Lifecycle (write-through) -------------------------------------------
    async assignDelivery(deliveryId: string, runId: string): Promise<void> {
      await api.assignDelivery(deliveryId, { delivery_run_id: runId })
      await this.loadDeliveries()
    },
    // Departing cascades a run's assigned deliveries to in_transit, so refetch both lists.
    async departRun(runId: string): Promise<void> {
      await api.departRun(runId)
      await Promise.all([this.loadRuns(), this.loadDeliveries()])
    },
    async markDelivered(deliveryId: string, delivered: boolean): Promise<void> {
      await api.markDelivered(deliveryId, delivered)
      await this.loadDeliveries()
    },
    async finishRun(runId: string): Promise<void> {
      await api.finishRun(runId)
      await this.loadRuns()
    },
  },
})
