import { defineStore } from 'pinia'
import * as api from '@/services/inventory.api'
import type {
  Movement,
  RecountInput,
  RegisterMovementInput,
  Stock,
} from '@/services/inventory.api'
import { listIngredients } from '@/services/recipes.api'
import { useCatalogStore } from '@/stores/catalog'

// A stock row joined to its resolved label and a low-stock flag — the unit the list renders.
export interface StockRow {
  stock: Stock
  name: string
  unitAbbr: string
  low: boolean
}

interface IngredientInfo {
  name: string
  unitAbbr: string
}

interface InventoryState {
  // The branch whose inventory is loaded; all writes are scoped to it (held here so a branch with
  // zero stock rows can still register its first movement).
  branchId: string | null
  stock: Stock[]
  // ingredient_id → name + unit abbreviation, resolved from /recipes/ingredients × catalog units.
  ingredientIndex: Record<string, IngredientInfo>
  selectedIngredientId: string | null
  // The selected ingredient's movement history (newest-first from the backend).
  movements: Movement[]
}

function isLow(stock: Stock): boolean {
  return Number(stock.current_quantity) <= Number(stock.min_stock)
}

// Write-through discipline (as in the cash/kitchen stores): every mutation calls the API then
// refetches the affected stock (and the selected ingredient's history) so the screen reflects
// server state verbatim. Stock rows carry only ingredient_id, so labels are resolved client-side.
export const useInventoryStore = defineStore('inventory', {
  state: (): InventoryState => ({
    branchId: null,
    stock: [],
    ingredientIndex: {},
    selectedIngredientId: null,
    movements: [],
  }),

  getters: {
    // A label for an ingredient, degrading to a short id ref when it can't be resolved.
    ingredientLabel:
      (state) =>
      (ingredientId: string): string =>
        state.ingredientIndex[ingredientId]?.name ?? `#${ingredientId.slice(0, 8)}`,

    // Stock joined to labels + low flag, ordered low-first then by name.
    rows: (state): StockRow[] => {
      const rows = state.stock.map((stock) => {
        const info = state.ingredientIndex[stock.ingredient_id]
        return {
          stock,
          name: info?.name ?? `#${stock.ingredient_id.slice(0, 8)}`,
          unitAbbr: info?.unitAbbr ?? '',
          low: isLow(stock),
        }
      })
      return rows.sort((a, b) => {
        if (a.low !== b.low) return a.low ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    },

    lowRows(): StockRow[] {
      return this.rows.filter((r) => r.low)
    },

    selectedStock: (state): Stock | null =>
      state.stock.find((s) => s.ingredient_id === state.selectedIngredientId) ?? null,
  },

  actions: {
    // Load the active branch's stock and build the ingredient label index (ingredients × units).
    async loadBranch(branchId: string): Promise<void> {
      const catalog = useCatalogStore()
      const [stock, ingredients] = await Promise.all([
        api.listStock(branchId),
        listIngredients(),
        catalog.units.length ? Promise.resolve() : catalog.fetchUnits(),
      ])
      this.branchId = branchId
      this.stock = stock
      const index: Record<string, IngredientInfo> = {}
      for (const ing of ingredients) {
        index[ing.id] = {
          name: ing.name,
          unitAbbr: catalog.units.find((u) => u.id === ing.unit_of_measure_id)?.abbreviation ?? '',
        }
      }
      this.ingredientIndex = index
    },

    async selectIngredient(ingredientId: string): Promise<void> {
      this.selectedIngredientId = ingredientId
      this.movements = await api.listMovements(this.currentBranchId(), ingredientId)
    },

    async setThreshold(ingredientId: string, minStock: string): Promise<void> {
      await api.setThreshold(this.currentBranchId(), {
        ingredient_id: ingredientId,
        min_stock: minStock,
      })
      await this.refreshStock()
    },

    async registerMovement(input: RegisterMovementInput): Promise<void> {
      await api.registerMovement(this.currentBranchId(), input)
      await this.afterWrite(input.ingredient_id)
    },

    async recount(input: RecountInput): Promise<void> {
      await api.recount(this.currentBranchId(), input)
      await this.afterWrite(input.ingredient_id)
    },

    // --- internal helpers ----------------------------------------------------
    currentBranchId(): string {
      if (!this.branchId) throw new Error('No hay sucursal de inventario cargada.')
      return this.branchId
    },

    async refreshStock(): Promise<void> {
      this.stock = await api.listStock(this.currentBranchId())
    },

    // After a movement/recount: refresh stock, and the ingredient's history if it's selected.
    async afterWrite(ingredientId: string): Promise<void> {
      await this.refreshStock()
      if (this.selectedIngredientId === ingredientId) {
        this.movements = await api.listMovements(this.currentBranchId(), ingredientId)
      }
    },
  },
})
