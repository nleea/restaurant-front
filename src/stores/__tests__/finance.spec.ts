import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listCategories: vi.fn<(...a: unknown[]) => unknown>(),
  createCategory: vi.fn<(...a: unknown[]) => unknown>(),
  updateCategory: vi.fn<(...a: unknown[]) => unknown>(),
  listExpenses: vi.fn<(...a: unknown[]) => unknown>(),
  getExpense: vi.fn<(...a: unknown[]) => unknown>(),
  recordExpense: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/finance.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

import { useFinanceStore } from '../finance'

const category = (id: string, name: string, active = true) => ({ id, name, is_active: active })
const expense = (id: string, categoryId: string, amount: string) => ({
  id,
  branch_id: 'b1',
  expense_category_id: categoryId,
  description: 'x',
  amount,
  employee_id: 'e1',
  incurred_at: null,
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('finance store', () => {
  it('loads categories and expenses, exposes active filter and name fallback', async () => {
    apiMock.listCategories.mockResolvedValue([category('c1', 'Arriendo'), category('c2', 'Vieja', false)])
    apiMock.listExpenses.mockResolvedValue([expense('e1', 'c1', '100.00')])
    const f = useFinanceStore()
    await f.loadCategories()
    await f.loadExpenses('b1')
    expect(apiMock.listExpenses).toHaveBeenCalledWith({ branchId: 'b1', categoryId: undefined })
    expect(f.activeCategories.map((c) => c.id)).toEqual(['c1'])
    expect(f.categoryName('c1')).toBe('Arriendo')
    expect(f.categoryName('zzzzzzzz99')).toBe('#zzzzzzzz')
  })

  it('passes the category filter through when loading expenses', async () => {
    apiMock.listExpenses.mockResolvedValue([])
    const f = useFinanceStore()
    await f.loadExpenses('b1', 'c1')
    expect(apiMock.listExpenses).toHaveBeenCalledWith({ branchId: 'b1', categoryId: 'c1' })
    expect(f.categoryFilter).toBe('c1')
  })

  it('derives total and per-category subtotals in integer cents', async () => {
    apiMock.listExpenses.mockResolvedValue([
      expense('e1', 'c1', '100.50'),
      expense('e2', 'c1', '49.50'),
      expense('e3', 'c2', '200.00'),
    ])
    const f = useFinanceStore()
    await f.loadExpenses('b1')
    expect(f.total).toBe('350.00')
    const subs = f.subtotalsByCategory
    // descending by amount: c2 (200) then c1 (150)
    expect(subs[0]).toEqual({ categoryId: 'c2', amount: '200.00' })
    expect(subs[1]).toEqual({ categoryId: 'c1', amount: '150.00' })
  })

  it('creating a category write-through refetches the list', async () => {
    apiMock.createCategory.mockResolvedValue(category('c9', 'Nueva'))
    apiMock.listCategories.mockResolvedValue([category('c9', 'Nueva')])
    const f = useFinanceStore()
    await f.createCategory('Nueva')
    expect(apiMock.createCategory).toHaveBeenCalledWith({ name: 'Nueva' })
    expect(f.categories).toHaveLength(1)
  })

  it('deactivating a category patches is_active false then refetches', async () => {
    apiMock.updateCategory.mockResolvedValue(category('c1', 'Arriendo', false))
    apiMock.listCategories.mockResolvedValue([category('c1', 'Arriendo', false)])
    const f = useFinanceStore()
    await f.deactivateCategory('c1')
    expect(apiMock.updateCategory).toHaveBeenCalledWith('c1', { is_active: false })
    expect(f.categories[0]?.is_active).toBe(false)
  })

  it('recording an expense refetches honoring the active filter', async () => {
    apiMock.listExpenses.mockResolvedValueOnce([]).mockResolvedValueOnce([expense('e1', 'c1', '80.00')])
    const f = useFinanceStore()
    await f.loadExpenses('b1', 'c1') // sets categoryFilter = c1
    await f.recordExpense({
      branch_id: 'b1',
      expense_category_id: 'c1',
      description: 'Luz',
      amount: '80.00',
      employee_id: 'e1',
    })
    expect(apiMock.recordExpense).toHaveBeenCalled()
    // refetch must keep the c1 filter
    expect(apiMock.listExpenses).toHaveBeenLastCalledWith({ branchId: 'b1', categoryId: 'c1' })
    expect(f.expenses).toHaveLength(1)
  })
})
