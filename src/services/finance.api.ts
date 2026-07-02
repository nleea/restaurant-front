// Typed Finance API layer over `/finance` — the operating-expense ledger. Categories are
// tenant-scoped; expenses are branch-scoped. Reads require `finance.read`; category create/rename/
// deactivate and recording expenses require `finance.manage`. `amount` is a server-side decimal
// serialized as a string ("150.50") and kept verbatim in transit; only the display layer reformats.
import { http } from '@/lib/http'

export interface ExpenseCategory {
  id: string
  name: string
  is_active: boolean
}

export interface Expense {
  id: string
  branch_id: string
  expense_category_id: string
  description: string
  amount: string
  employee_id: string
  incurred_at: string | null
}

export interface UpdateCategoryInput {
  name?: string
  is_active?: boolean
}

export interface RecordExpenseInput {
  branch_id: string
  expense_category_id: string
  description: string
  amount: string
  employee_id: string
  incurred_at?: string | null
}

// --- Categories (tenant-scoped) ------------------------------------------------------------
export async function listCategories(active?: boolean): Promise<ExpenseCategory[]> {
  const params = active === undefined ? undefined : { active: String(active) }
  return (await http.get<ExpenseCategory[]>('/finance/categories', { params })).data
}

export async function createCategory(input: { name: string }): Promise<ExpenseCategory> {
  return (await http.post<ExpenseCategory>('/finance/categories', input)).data
}

export async function updateCategory(
  categoryId: string,
  patch: UpdateCategoryInput,
): Promise<ExpenseCategory> {
  return (await http.patch<ExpenseCategory>(`/finance/categories/${categoryId}`, patch)).data
}

// --- Expenses (branch-scoped) --------------------------------------------------------------
export async function listExpenses(filters: {
  branchId: string
  categoryId?: string
}): Promise<Expense[]> {
  const params: Record<string, string> = { branch_id: filters.branchId }
  if (filters.categoryId) params.category_id = filters.categoryId
  return (await http.get<Expense[]>('/finance/expenses', { params })).data
}

export async function getExpense(expenseId: string): Promise<Expense> {
  return (await http.get<Expense>(`/finance/expenses/${expenseId}`)).data
}

export async function recordExpense(input: RecordExpenseInput): Promise<Expense> {
  return (await http.post<Expense>('/finance/expenses', input)).data
}
