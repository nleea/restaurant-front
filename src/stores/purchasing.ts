import { defineStore } from 'pinia'
import * as api from '@/services/purchasing.api'
import type {
  AttachIngredientInput,
  CreateSupplierInput,
  Supplier,
  SupplierIngredient,
  UpdateSupplierInput,
} from '@/services/purchasing.api'
import { listIngredients } from '@/services/recipes.api'
import { useCatalogStore } from '@/stores/catalog'

interface IngredientInfo {
  name: string
  unitAbbr: string
}

interface PurchasingState {
  suppliers: Supplier[]
  selectedSupplierId: string | null
  // The selected supplier's ingredient catalog.
  catalog: SupplierIngredient[]
  // ingredient_id → name + unit abbreviation, resolved from /recipes/ingredients × catalog units.
  ingredientIndex: Record<string, IngredientInfo>
}

// Suppliers are tenant-scoped (no branch). Write-through discipline (as in the inventory/cash
// stores): every mutation calls the API then refetches the affected collection so the screen
// reflects server state verbatim. Supplier-ingredient rows carry only ids, resolved client-side.
export const usePurchasingStore = defineStore('purchasing', {
  state: (): PurchasingState => ({
    suppliers: [],
    selectedSupplierId: null,
    catalog: [],
    ingredientIndex: {},
  }),

  getters: {
    selectedSupplier: (state): Supplier | null =>
      state.suppliers.find((s) => s.id === state.selectedSupplierId) ?? null,

    activeSuppliers: (state): Supplier[] => state.suppliers.filter((s) => s.is_active),

    supplierName:
      (state) =>
      (supplierId: string): string =>
        state.suppliers.find((s) => s.id === supplierId)?.name ?? `#${supplierId.slice(0, 8)}`,

    // A label for an ingredient, degrading to a short id ref when it can't be resolved.
    ingredientLabel:
      (state) =>
      (ingredientId: string): string =>
        state.ingredientIndex[ingredientId]?.name ?? `#${ingredientId.slice(0, 8)}`,

    unitAbbrOf:
      (state) =>
      (ingredientId: string): string =>
        state.ingredientIndex[ingredientId]?.unitAbbr ?? '',
  },

  actions: {
    async loadSuppliers(): Promise<void> {
      this.suppliers = await api.listSuppliers()
    },

    // Build the ingredient label index (ingredients × catalog units) once for the catalog UI.
    async loadDirectory(): Promise<void> {
      const catalog = useCatalogStore()
      const [ingredients] = await Promise.all([
        listIngredients(),
        catalog.units.length ? Promise.resolve() : catalog.fetchUnits(),
      ])
      const index: Record<string, IngredientInfo> = {}
      for (const ing of ingredients) {
        index[ing.id] = {
          name: ing.name,
          unitAbbr: catalog.units.find((u) => u.id === ing.unit_of_measure_id)?.abbreviation ?? '',
        }
      }
      this.ingredientIndex = index
    },

    async selectSupplier(supplierId: string): Promise<void> {
      this.selectedSupplierId = supplierId
      this.catalog = await api.listSupplierIngredients(supplierId)
    },

    async createSupplier(input: CreateSupplierInput): Promise<Supplier> {
      const supplier = await api.createSupplier(input)
      await this.loadSuppliers()
      return supplier
    },

    async updateSupplier(supplierId: string, patch: UpdateSupplierInput): Promise<void> {
      await api.updateSupplier(supplierId, patch)
      await this.loadSuppliers()
    },

    // No DELETE endpoint — deactivation is a patch that flips is_active.
    async deactivateSupplier(supplierId: string): Promise<void> {
      await this.updateSupplier(supplierId, { is_active: false })
    },

    async attachIngredient(supplierId: string, input: AttachIngredientInput): Promise<void> {
      await api.attachIngredient(supplierId, input)
      await this.reloadCatalog(supplierId)
    },

    async detachIngredient(supplierId: string, ingredientId: string): Promise<void> {
      await api.detachIngredient(supplierId, ingredientId)
      await this.reloadCatalog(supplierId)
    },

    // Refetch the catalog only when the affected supplier is the one on screen.
    async reloadCatalog(supplierId: string): Promise<void> {
      if (this.selectedSupplierId === supplierId) {
        this.catalog = await api.listSupplierIngredients(supplierId)
      }
    },
  },
})
