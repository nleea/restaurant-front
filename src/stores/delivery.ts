import { defineStore } from 'pinia'
import * as api from '@/services/delivery.api'
import type {
  CreateRouteInput,
  DeliverySettings,
  Route,
  RouteDriver,
  UpdateRouteInput,
} from '@/services/delivery.api'

interface DeliveryState {
  // The branch whose routes are loaded (held so driver writes can refetch the right route list).
  branchId: string | null
  routes: Route[]
  selectedRouteId: string | null
  // The selected route's assigned drivers.
  drivers: RouteDriver[]
  // Coverage-map config (lazy-created server-side; null coords = pin not placed yet).
  settings: DeliverySettings | null
}

// Branch-scoped delivery routes + their drivers. Write-through discipline (as in the inventory/
// purchasing stores): every mutation refetches the affected collection so the screen reflects
// server state verbatim. Route drivers carry only employee_id; names are resolved by the components.
export const useDeliveryStore = defineStore('delivery', {
  state: (): DeliveryState => ({
    branchId: null,
    routes: [],
    selectedRouteId: null,
    drivers: [],
    settings: null,
  }),

  getters: {
    activeRoutes: (state): Route[] => state.routes.filter((r) => r.is_active),

    selectedRoute: (state): Route | null =>
      state.routes.find((r) => r.id === state.selectedRouteId) ?? null,
  },

  actions: {
    async loadRoutes(branchId: string): Promise<void> {
      this.branchId = branchId
      this.routes = await api.listRoutes(branchId)
    },

    // --- Coverage-map settings (write-through) --------------------------------
    async loadSettings(branchId: string): Promise<void> {
      this.settings = await api.getSettings(branchId)
    },
    async saveSettings(
      patch: Partial<{ latitude: string; longitude: string; ring_step_km: string }>,
    ): Promise<void> {
      if (!this.branchId) return
      this.settings = await api.updateSettings(this.branchId, patch)
    },

    async selectRoute(routeId: string): Promise<void> {
      this.selectedRouteId = routeId
      this.drivers = await api.listDrivers(routeId)
    },

    // --- Route mutations (write-through) -------------------------------------
    async createRoute(input: CreateRouteInput): Promise<Route> {
      const route = await api.createRoute(input)
      await this.refreshRoutes()
      return route
    },
    async updateRoute(routeId: string, patch: UpdateRouteInput): Promise<void> {
      await api.updateRoute(routeId, patch)
      await this.refreshRoutes()
    },
    // No DELETE endpoint — deactivation is a patch that flips is_active.
    async deactivateRoute(routeId: string): Promise<void> {
      await this.updateRoute(routeId, { is_active: false })
    },

    // --- Driver mutations (write-through) ------------------------------------
    async assignDriver(routeId: string, employeeId: string): Promise<void> {
      await api.assignDriver(routeId, { employee_id: employeeId })
      await this.refreshDrivers(routeId)
    },
    async removeDriver(routeId: string, employeeId: string): Promise<void> {
      await api.removeDriver(routeId, employeeId)
      await this.refreshDrivers(routeId)
    },

    // --- internal helpers ----------------------------------------------------
    async refreshRoutes(): Promise<void> {
      if (this.branchId) this.routes = await api.listRoutes(this.branchId)
    },
    async refreshDrivers(routeId: string): Promise<void> {
      if (this.selectedRouteId === routeId) this.drivers = await api.listDrivers(routeId)
    },
  },
})
