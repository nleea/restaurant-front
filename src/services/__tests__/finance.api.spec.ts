import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
const patch = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
}))

import * as api from '../finance.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
})

describe('finance api layer', () => {
  it('lists categories, passing active only when given', async () => {
    get.mockResolvedValue({ data: [{ id: 'c1', name: 'Arriendo' }] })
    await api.listCategories()
    expect(get).toHaveBeenCalledWith('/finance/categories', { params: undefined })
    await api.listCategories(true)
    expect(get).toHaveBeenLastCalledWith('/finance/categories', { params: { active: 'true' } })
  })

  it('creates and updates (deactivates) a category', async () => {
    post.mockResolvedValue({ data: { id: 'c1' } })
    patch.mockResolvedValue({ data: { id: 'c1', is_active: false } })
    await api.createCategory({ name: 'Servicios' })
    await api.updateCategory('c1', { is_active: false })
    expect(post).toHaveBeenCalledWith('/finance/categories', { name: 'Servicios' })
    expect(patch).toHaveBeenCalledWith('/finance/categories/c1', { is_active: false })
  })

  it('lists expenses scoped to a branch, with the category filter only when given', async () => {
    get.mockResolvedValue({ data: [] })
    await api.listExpenses({ branchId: 'b1' })
    expect(get).toHaveBeenCalledWith('/finance/expenses', { params: { branch_id: 'b1' } })
    await api.listExpenses({ branchId: 'b1', categoryId: 'c1' })
    expect(get).toHaveBeenLastCalledWith('/finance/expenses', {
      params: { branch_id: 'b1', category_id: 'c1' },
    })
  })

  it('records an expense', async () => {
    post.mockResolvedValue({ data: { id: 'e1', amount: '150.00' } })
    await api.recordExpense({
      branch_id: 'b1',
      expense_category_id: 'c1',
      description: 'Recibo de luz',
      amount: '150.00',
      employee_id: 'emp1',
    })
    expect(post).toHaveBeenCalledWith('/finance/expenses', {
      branch_id: 'b1',
      expense_category_id: 'c1',
      description: 'Recibo de luz',
      amount: '150.00',
      employee_id: 'emp1',
    })
  })
})
