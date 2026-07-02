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

import * as api from '../customers.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('customers api layer', () => {
  it('lists customers, passing active only when given', async () => {
    get.mockResolvedValue({ data: [{ id: 'c1', first_name: 'John' }] })
    await api.listCustomers()
    expect(get).toHaveBeenCalledWith('/customers', { params: undefined })
    await api.listCustomers(true)
    expect(get).toHaveBeenLastCalledWith('/customers', { params: { active: 'true' } })
  })

  it('creates, updates and deactivates a customer', async () => {
    post.mockResolvedValue({ data: { id: 'c1', first_name: 'John' } })
    patch.mockResolvedValue({ data: { id: 'c1', is_active: true } })
    del.mockResolvedValue({ data: { id: 'c1', is_active: false } })
    await api.createCustomer({ first_name: 'John', last_name: 'Diner' })
    await api.updateCustomer('c1', { is_active: true })
    const deact = await api.deactivateCustomer('c1')
    expect(post).toHaveBeenCalledWith('/customers', { first_name: 'John', last_name: 'Diner' })
    expect(patch).toHaveBeenCalledWith('/customers/c1', { is_active: true })
    expect(del).toHaveBeenCalledWith('/customers/c1')
    expect(deact.is_active).toBe(false)
  })

  it('sets and removes preferences', async () => {
    post.mockResolvedValue({ data: { id: 'p1' } })
    del.mockResolvedValue({ data: undefined })
    await api.setPreference('c1', { key: 'mesa', value: 'ventana' })
    await api.removePreference('p1')
    expect(post).toHaveBeenCalledWith('/customers/c1/preferences', { key: 'mesa', value: 'ventana' })
    expect(del).toHaveBeenCalledWith('/customers/preferences/p1')
  })

  it('registers and lists credits with nested paths', async () => {
    post.mockResolvedValue({ data: { id: 'cr1', payment_status: 'pending' } })
    get.mockResolvedValue({ data: [{ id: 'cr1' }] })
    await api.registerCredit('c1', { total_amount: '50000.00' })
    expect(post).toHaveBeenCalledWith('/customers/c1/credits', { total_amount: '50000.00' })
    await api.listCredits('c1')
    expect(get).toHaveBeenLastCalledWith('/customers/c1/credits')
    await api.getCredit('cr1')
    expect(get).toHaveBeenLastCalledWith('/customers/credits/cr1')
  })

  it('registers and lists credit payments under the credit path', async () => {
    post.mockResolvedValue({ data: { id: 'pay1' } })
    get.mockResolvedValue({ data: [{ id: 'pay1' }] })
    await api.registerCreditPayment('cr1', { amount: '20000.00', method: 'cash', employee_id: 'e1' })
    expect(post).toHaveBeenCalledWith('/customers/credits/cr1/payments', {
      amount: '20000.00',
      method: 'cash',
      employee_id: 'e1',
    })
    await api.listCreditPayments('cr1')
    expect(get).toHaveBeenCalledWith('/customers/credits/cr1/payments')
  })
})
