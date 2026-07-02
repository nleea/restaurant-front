import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
const put = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    put: (...a: unknown[]) => put(...a),
  },
}))

import * as api from '../inventory.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
})

describe('inventory api layer', () => {
  it('lists stock and low stock for a branch', async () => {
    get.mockResolvedValue({ data: [{ id: 's1' }] })
    await api.listStock('b1')
    expect(get).toHaveBeenCalledWith('/inventory/branches/b1/stock')
    await api.listLowStock('b1')
    expect(get).toHaveBeenLastCalledWith('/inventory/branches/b1/stock/low')
  })

  it('gets one ingredient stock', async () => {
    get.mockResolvedValue({ data: { id: 's1', ingredient_id: 'i1' } })
    await api.getStock('b1', 'i1')
    expect(get).toHaveBeenCalledWith('/inventory/branches/b1/stock/i1')
  })

  it('sets a reorder threshold', async () => {
    put.mockResolvedValue({ data: { id: 's1', min_stock: '5.000' } })
    const stock = await api.setThreshold('b1', { ingredient_id: 'i1', min_stock: '5.000' })
    expect(put).toHaveBeenCalledWith('/inventory/branches/b1/stock/threshold', {
      ingredient_id: 'i1',
      min_stock: '5.000',
    })
    expect(stock.min_stock).toBe('5.000')
  })

  it('registers a movement', async () => {
    post.mockResolvedValue({ data: { id: 'm1', type: 'in' } })
    await api.registerMovement('b1', {
      ingredient_id: 'i1',
      employee_id: 'e1',
      type: 'in',
      quantity: '10.000',
      reason: 'received',
    })
    expect(post).toHaveBeenCalledWith('/inventory/branches/b1/movements', {
      ingredient_id: 'i1',
      employee_id: 'e1',
      type: 'in',
      quantity: '10.000',
      reason: 'received',
    })
  })

  it('records a recount and lists movement history', async () => {
    post.mockResolvedValue({ data: { id: 'm2', type: 'adjustment' } })
    get.mockResolvedValue({ data: [{ id: 'm1' }] })
    await api.recount('b1', { ingredient_id: 'i1', employee_id: 'e1', counted_quantity: '8.000' })
    expect(post).toHaveBeenCalledWith('/inventory/branches/b1/recounts', {
      ingredient_id: 'i1',
      employee_id: 'e1',
      counted_quantity: '8.000',
    })
    const movements = await api.listMovements('b1', 'i1')
    expect(get).toHaveBeenCalledWith('/inventory/branches/b1/movements/i1')
    expect(movements).toHaveLength(1)
  })
})
