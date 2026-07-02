import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
const patch = vi.fn<(...a: unknown[]) => unknown>()
const del = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}))

import * as api from '../purchasing.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('purchasing api layer', () => {
  it('lists suppliers, passing active only when given', async () => {
    get.mockResolvedValue({ data: [{ id: 'sup1', name: 'Distri' }] })
    await api.listSuppliers()
    expect(get).toHaveBeenCalledWith('/purchasing/suppliers', { params: undefined })
    await api.listSuppliers(true)
    expect(get).toHaveBeenLastCalledWith('/purchasing/suppliers', { params: { active: 'true' } })
  })

  it('creates and updates (deactivates) a supplier', async () => {
    post.mockResolvedValue({ data: { id: 'sup1' } })
    patch.mockResolvedValue({ data: { id: 'sup1', is_active: false } })
    await api.createSupplier({ name: 'Distri', phone: '300' })
    await api.updateSupplier('sup1', { is_active: false })
    expect(post).toHaveBeenCalledWith('/purchasing/suppliers', { name: 'Distri', phone: '300' })
    expect(patch).toHaveBeenCalledWith('/purchasing/suppliers/sup1', { is_active: false })
  })

  it('lists, attaches and detaches supplier ingredients', async () => {
    get.mockResolvedValue({ data: [{ id: 'si1' }] })
    post.mockResolvedValue({ data: { id: 'si1' } })
    del.mockResolvedValue({ data: undefined })
    await api.listSupplierIngredients('sup1')
    expect(get).toHaveBeenCalledWith('/purchasing/suppliers/sup1/ingredients')
    await api.attachIngredient('sup1', {
      ingredient_id: 'i1',
      reference_price: '1200.00',
      unit_of_measure_id: 'u-kg',
    })
    expect(post).toHaveBeenCalledWith('/purchasing/suppliers/sup1/ingredients', {
      ingredient_id: 'i1',
      reference_price: '1200.00',
      unit_of_measure_id: 'u-kg',
    })
    await api.detachIngredient('sup1', 'i1')
    expect(del).toHaveBeenCalledWith('/purchasing/suppliers/sup1/ingredients/i1')
  })
})
