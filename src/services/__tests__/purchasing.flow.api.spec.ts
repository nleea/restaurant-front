import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}))

import * as api from '../purchasing.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('purchasing flow api layer', () => {
  it('creates and lists requests, passing status_filter only when given', async () => {
    post.mockResolvedValue({ data: { id: 'r1', status: 'pending' } })
    get.mockResolvedValue({ data: [] })
    await api.createRequest({
      branch_id: 'b1',
      requested_by_employee_id: 'e1',
      items: [{ ingredient_id: 'i1', requested_quantity: '5.000', unit_of_measure_id: 'u-kg' }],
    })
    expect(post).toHaveBeenCalledWith('/purchasing/requests', expect.objectContaining({ branch_id: 'b1' }))
    await api.listRequests()
    expect(get).toHaveBeenCalledWith('/purchasing/requests', { params: undefined })
    await api.listRequests('pending')
    expect(get).toHaveBeenLastCalledWith('/purchasing/requests', { params: { status_filter: 'pending' } })
  })

  it('approves and rejects a request with an employee id', async () => {
    post.mockResolvedValue({ data: { id: 'r1', status: 'approved' } })
    await api.approveRequest('r1', { employee_id: 'e2' })
    expect(post).toHaveBeenCalledWith('/purchasing/requests/r1/approve', { employee_id: 'e2' })
    await api.rejectRequest('r1', { employee_id: 'e2' })
    expect(post).toHaveBeenLastCalledWith('/purchasing/requests/r1/reject', { employee_id: 'e2' })
  })

  it('lists request items and order items', async () => {
    get.mockResolvedValue({ data: [] })
    await api.listRequestItems('r1')
    expect(get).toHaveBeenCalledWith('/purchasing/requests/r1/items')
    await api.listOrderItems('o1')
    expect(get).toHaveBeenLastCalledWith('/purchasing/orders/o1/items')
  })

  it('creates an order from an approved request', async () => {
    post.mockResolvedValue({ data: { id: 'o1', status: 'created', total: '12000.00' } })
    await api.createOrder({
      purchase_request_id: 'r1',
      supplier_id: 'sup1',
      items: [
        { ingredient_id: 'i1', ordered_quantity: '5.000', unit_price: '2400.00', unit_of_measure_id: 'u-kg' },
      ],
    })
    expect(post).toHaveBeenCalledWith('/purchasing/orders', expect.objectContaining({ supplier_id: 'sup1' }))
  })

  it('receives goods for an order', async () => {
    post.mockResolvedValue({ data: { id: 'o1', status: 'partially_received' } })
    await api.receiveOrder('o1', {
      received_by_employee_id: 'e1',
      items: [{ order_item_id: 'oi1', quantity: '3.000' }],
    })
    expect(post).toHaveBeenCalledWith('/purchasing/orders/o1/receive', {
      received_by_employee_id: 'e1',
      items: [{ order_item_id: 'oi1', quantity: '3.000' }],
    })
  })

  it('registers and lists order payments', async () => {
    post.mockResolvedValue({ data: { id: 'p1', amount: '5000.00' } })
    get.mockResolvedValue({ data: [{ id: 'p1' }] })
    await api.registerPayment('o1', { amount: '5000.00', method: 'transfer', employee_id: 'e1' })
    expect(post).toHaveBeenCalledWith('/purchasing/orders/o1/payments', {
      amount: '5000.00',
      method: 'transfer',
      employee_id: 'e1',
    })
    const payments = await api.listPayments('o1')
    expect(get).toHaveBeenCalledWith('/purchasing/orders/o1/payments')
    expect(payments).toHaveLength(1)
  })
})
