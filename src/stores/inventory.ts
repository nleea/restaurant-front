import { defineStore } from 'pinia'
import * as api from '@/services/inventory.api'
import type {
  Movement,
  RecountInput,
  RegisterMovementInput,
  Stock,
} from '@/services/inventory.api'
import {
  createIngredient,
  listIngredients,
  updateIngredient,
  type UpdateIngredientInput,
} from '@/services/recipes.api'
import { useCatalogStore } from '@/stores/catalog'

// A stock row joined to its resolved label and stock-state flags — the unit the list renders.
export interface StockRow {
  stock: Stock
  name: string
  unitAbbr: string
  category: string | null
  low: boolean
  out: boolean
}

interface IngredientInfo {
  name: string
  unitAbbr: string
  unitId: string
  category: string | null
}

// "Nuevo insumo" composes three real writes; the flags name what succeeded so the
// UI can render partial-success copy ("insumo creado, falta el stock inicial").
export interface CreateInsumoInput {
  name: string
  category: string | null
  unitOfMeasureId: string
  initialQuantity: string | null
  minStock: string | null
  employeeId: string | null
}
export interface CreateInsumoResult {
  ingredientId: string
  stockOk: boolean
  thresholdOk: boolean
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

    // Stock joined to labels + state flags, ordered low-first then by name.
    rows: (state): StockRow[] => {
      const rows = state.stock.map((stock) => {
        const info = state.ingredientIndex[stock.ingredient_id]
        return {
          stock,
          name: info?.name ?? `#${stock.ingredient_id.slice(0, 8)}`,
          unitAbbr: info?.unitAbbr ?? '',
          category: info?.category ?? null,
          low: isLow(stock),
          out: Number(stock.current_quantity) <= 0,
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

    // Distinct categories present in the directory — feeds the board's filter and suggestions.
    categories: (state): string[] =>
      [
        ...new Set(
          Object.values(state.ingredientIndex)
            .map((i) => i.category)
            .filter((c): c is string => c !== null && c !== ''),
        ),
      ].sort((a, b) => a.localeCompare(b)),

    ingredientInfo:
      (state) =>
      (ingredientId: string): IngredientInfo | null =>
        state.ingredientIndex[ingredientId] ?? null,

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
          unitId: ing.unit_of_measure_id,
          category: ing.category ?? null,
        }
      }
      this.ingredientIndex = index
    },

    // Rebuild the ingredient index after a create/edit (units are already cached).
    async reloadIngredients(): Promise<void> {
      const catalog = useCatalogStore()
      const ingredients = await listIngredients()
      const index: Record<string, IngredientInfo> = {}
      for (const ing of ingredients) {
        index[ing.id] = {
          name: ing.name,
          unitAbbr: catalog.units.find((u) => u.id === ing.unit_of_measure_id)?.abbreviation ?? '',
          unitId: ing.unit_of_measure_id,
          category: ing.category ?? null,
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

    // --- Insumo directory (recipes module, `recipes.write`) -------------------
    // Ordered writes, never atomic: the result flags let the UI name what's pending.
    async createInsumo(input: CreateInsumoInput): Promise<CreateInsumoResult> {
      const ingredient = await createIngredient({
        name: input.name,
        category: input.category,
        unit_of_measure_id: input.unitOfMeasureId,
      })
      let stockOk = true
      let thresholdOk = true
      if (input.initialQuantity && Number(input.initialQuantity) > 0 && input.employeeId) {
        try {
          await api.registerMovement(this.currentBranchId(), {
            ingredient_id: ingredient.id,
            employee_id: input.employeeId,
            type: 'in',
            quantity: input.initialQuantity,
            reason: 'Stock inicial',
          })
        } catch {
          stockOk = false
        }
      }
      if (input.minStock && Number(input.minStock) >= 0) {
        try {
          await api.setThreshold(this.currentBranchId(), {
            ingredient_id: ingredient.id,
            min_stock: input.minStock,
          })
        } catch {
          thresholdOk = false
        }
      }
      await Promise.all([this.refreshStock(), this.reloadIngredients()])
      return { ingredientId: ingredient.id, stockOk, thresholdOk }
    },

    async updateInsumo(ingredientId: string, patch: UpdateIngredientInput): Promise<void> {
      await updateIngredient(ingredientId, patch)
      await this.reloadIngredients()
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
