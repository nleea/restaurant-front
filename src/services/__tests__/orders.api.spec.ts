import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
  },
}))

import * as api from '../orders.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('orders payments api layer', () => {
  it('registers a payment via POST /orders/{id}/payments', async () => {
    const payment = {
      id: 'p1',
      order_id: 'o1',
      branch_id: 'b1',
      cash_session_id: 'cs1',
      amount: '20000.00',
      method: 'cash',
      employee_id: 'e1',
      diner_reference: null,
    }
    post.mockResolvedValue({ data: payment })
    const input = { amount: '20000.00', method: 'cash' as const, employee_id: 'e1' }
    const result = await api.registerPayment('o1', input)
    expect(post).toHaveBeenCalledWith('/orders/o1/payments', input)
    expect(result).toEqual(payment)
  })

  it('lists payments via GET /orders/{id}/payments', async () => {
    get.mockResolvedValue({ data: [{ id: 'p1', amount: '20000.00', method: 'nequi' }] })
    const payments = await api.listPayments('o1')
    expect(get).toHaveBeenCalledWith('/orders/o1/payments')
    expect(payments).toHaveLength(1)
  })
})
