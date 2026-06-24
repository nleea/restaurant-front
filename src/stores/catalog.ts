import { defineStore } from 'pinia'
import * as api from '@/services/catalog.api'
import type { Unit, UnitInput } from '@/services/catalog.api'

interface CatalogState {
  units: Unit[]
}

// Units of measure only (the catalog slice Inventory/Recipes need). Write-then-refetch, like
// the RBAC and menu stores. A unit with no base_unit_id is a base unit; otherwise it is derived.
export const useCatalogStore = defineStore('catalog', {
  state: (): CatalogState => ({
    units: [],
  }),

  getters: {
    baseUnits: (state): Unit[] => state.units.filter((u) => u.base_unit_id === null),
    derivedUnits: (state): Unit[] => state.units.filter((u) => u.base_unit_id !== null),
    unitName: (state) => (id: string): string | undefined =>
      state.units.find((u) => u.id === id)?.name,
  },

  actions: {
    async fetchUnits(): Promise<void> {
      this.units = await api.listUnits()
    },
    async createUnit(input: UnitInput): Promise<Unit> {
      const unit = await api.createUnit(input)
      await this.fetchUnits()
      return unit
    },
    async updateUnit(id: string, patch: Partial<UnitInput>): Promise<void> {
      await api.updateUnit(id, patch)
      await this.fetchUnits()
    },
  },
})
