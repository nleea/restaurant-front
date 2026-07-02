import { defineStore } from 'pinia'
import * as api from '@/services/finance.api'
import type { Expense, ExpenseCategory, RecordExpenseInput, UpdateCategoryInput } from '@/services/finance.api'

// Amounts travel as strings; the only client arithmetic is the total and per-category subtotals,
// summed in integer cents so repeated parse/accumulate never drifts.
function toCents(value: string | null | undefined): number {
  if (!value) return 0
  return Math.round(Number(value) * 100)
}
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

export interface CategorySubtotal {
  categoryId: string
  amount: string
}

interface FinanceState {
  categories: ExpenseCategory[]
  expenses: Expense[]
  // The active category filter (null = all). Held so write-through refetch honours it.
  categoryFilter: string | null
}

// Categories are tenant-scoped; expenses are loaded scoped to the active branch (and the category
// filter). Write-through discipline: every mutation refetches the affected collection so the
// screen reflects server state verbatim. Category names are resolved from the loaded categories.
export const useFinanceStore = defineStore('finance', {
  state: (): FinanceState => ({
    categories: [],
    expenses: [],
    categoryFilter: null,
  }),

  getters: {
    activeCategories: (state): ExpenseCategory[] => state.categories.filter((c) => c.is_active),

    categoryName:
      (state) =>
      (categoryId: string): string =>
        state.categories.find((c) => c.id === categoryId)?.name ?? `#${categoryId.slice(0, 8)}`,

    // Integer-cents sum of the loaded expenses (already scoped by branch + category filter).
    total: (state): string =>
      fromCents(state.expenses.reduce((sum, e) => sum + toCents(e.amount), 0)),

    // Per-category breakdown of the loaded expenses, descending by amount.
    subtotalsByCategory: (state): CategorySubtotal[] => {
      const map = new Map<string, number>()
      for (const e of state.expenses) {
        map.set(e.expense_category_id, (map.get(e.expense_category_id) ?? 0) + toCents(e.amount))
      }
      return [...map.entries()]
        .map(([categoryId, cents]) => ({ categoryId, amount: fromCents(cents) }))
        .sort((a, b) => Number(b.amount) - Number(a.amount))
    },
  },

  actions: {
    async loadCategories(): Promise<void> {
      this.categories = await api.listCategories()
    },

    async loadExpenses(branchId: string, categoryId?: string | null): Promise<void> {
      this.categoryFilter = categoryId ?? null
      this.expenses = await api.listExpenses({
        branchId,
        categoryId: categoryId ?? undefined,
      })
    },

    async createCategory(name: string): Promise<ExpenseCategory> {
      const category = await api.createCategory({ name })
      await this.loadCategories()
      return category
    },

    async updateCategory(categoryId: string, patch: UpdateCategoryInput): Promise<void> {
      await api.updateCategory(categoryId, patch)
      await this.loadCategories()
    },

    // No DELETE endpoint — deactivation is a patch that flips is_active.
    async deactivateCategory(categoryId: string): Promise<void> {
      await this.updateCategory(categoryId, { is_active: false })
    },

    // Record an expense, then refetch the branch's expenses honouring the active category filter.
    async recordExpense(input: RecordExpenseInput): Promise<void> {
      await api.recordExpense(input)
      await this.loadExpenses(input.branch_id, this.categoryFilter)
    },
  },
})
