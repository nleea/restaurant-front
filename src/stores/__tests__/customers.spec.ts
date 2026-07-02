import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listCustomers: vi.fn<(...a: unknown[]) => unknown>(),
  getCustomer: vi.fn<(...a: unknown[]) => unknown>(),
  createCustomer: vi.fn<(...a: unknown[]) => unknown>(),
  updateCustomer: vi.fn<(...a: unknown[]) => unknown>(),
  deactivateCustomer: vi.fn<(...a: unknown[]) => unknown>(),
  listPreferences: vi.fn<(...a: unknown[]) => unknown>(),
  setPreference: vi.fn<(...a: unknown[]) => unknown>(),
  removePreference: vi.fn<(...a: unknown[]) => unknown>(),
  listCredits: vi.fn<(...a: unknown[]) => unknown>(),
  getCredit: vi.fn<(...a: unknown[]) => unknown>(),
  registerCredit: vi.fn<(...a: unknown[]) => unknown>(),
  listCreditPayments: vi.fn<(...a: unknown[]) => unknown>(),
  registerCreditPayment: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/customers.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

import { useCustomersStore } from '../customers'

const customer = (id: string, first: string, last: string, active = true) => ({
  id,
  person_id: `p-${id}`,
  user_id: null,
  total_spent: '0.00',
  order_count: 0,
  last_purchase_at: null,
  is_active: active,
  first_name: first,
  last_name: last,
  document_number: null,
  phone: null,
  email: null,
})
const credit = (id: string, total: string, status: string) => ({
  id,
  customer_id: 'c1',
  total_amount: total,
  payment_status: status,
  reference_id: null,
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('customers store', () => {
  it('loads customers and resolves names with fallback', async () => {
    apiMock.listCustomers.mockResolvedValue([customer('c1', 'John', 'Diner'), customer('c2', '', '', false)])
    const s = useCustomersStore()
    await s.loadCustomers()
    expect(s.activeCustomers.map((c) => c.id)).toEqual(['c1'])
    expect(s.customerName(s.customers[0]!)).toBe('John Diner')
    expect(s.customerName(s.customers[1]!)).toBe('#c2')
  })

  it('selecting a customer loads preferences and credits', async () => {
    apiMock.listPreferences.mockResolvedValue([{ id: 'pref1', key: 'mesa', value: 'ventana' }])
    apiMock.listCredits.mockResolvedValue([credit('cr1', '100.00', 'pending')])
    const s = useCustomersStore()
    await s.selectCustomer('c1')
    expect(s.selectedCustomerId).toBe('c1')
    expect(s.preferences).toHaveLength(1)
    expect(s.credits).toHaveLength(1)
  })

  it('creating a customer write-through refetches the list', async () => {
    apiMock.createCustomer.mockResolvedValue(customer('c9', 'New', 'Guy'))
    apiMock.listCustomers.mockResolvedValue([customer('c9', 'New', 'Guy')])
    const s = useCustomersStore()
    await s.createCustomer({ first_name: 'New', last_name: 'Guy' })
    expect(apiMock.createCustomer).toHaveBeenCalled()
    expect(s.customers).toHaveLength(1)
  })

  it('setting a preference write-through refetches preferences', async () => {
    apiMock.listPreferences.mockResolvedValue([{ id: 'pref1', key: 'k', value: 'v' }])
    const s = useCustomersStore()
    await s.setPreference('c1', 'k', 'v')
    expect(apiMock.setPreference).toHaveBeenCalledWith('c1', { key: 'k', value: 'v' })
    expect(s.preferences).toHaveLength(1)
  })

  it('derives a credit balance from its payments in integer cents', async () => {
    apiMock.listPreferences.mockResolvedValue([])
    apiMock.listCredits.mockResolvedValue([credit('cr1', '100.00', 'partial')])
    apiMock.listCreditPayments.mockResolvedValue([{ id: 'p1', amount: '40.50' }, { id: 'p2', amount: '9.50' }])
    const s = useCustomersStore()
    await s.selectCustomer('c1')
    await s.loadPayments('cr1')
    // 100 − (40.50 + 9.50) = 50.00
    expect(s.creditBalance('cr1')).toBe('50.00')
  })

  it('sums customer outstanding across not-paid credits', async () => {
    apiMock.listPreferences.mockResolvedValue([])
    apiMock.listCredits.mockResolvedValue([
      credit('cr1', '100.00', 'pending'),
      credit('cr2', '50.00', 'paid'), // excluded
      credit('cr3', '30.00', 'partial'),
    ])
    apiMock.listCreditPayments.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args[0] === 'cr3' ? [{ id: 'x', amount: '10.00' }] : []),
    )
    const s = useCustomersStore()
    await s.selectCustomer('c1')
    await s.loadPayments('cr1')
    await s.loadPayments('cr3')
    // cr1 balance 100 + cr3 balance 20 = 120 (cr2 paid, excluded)
    expect(s.customerOutstanding).toBe('120.00')
  })

  it('registering a credit payment refetches the credits and the credit payments', async () => {
    apiMock.listPreferences.mockResolvedValue([])
    apiMock.listCredits.mockResolvedValueOnce([credit('cr1', '100.00', 'pending')])
    const s = useCustomersStore()
    await s.selectCustomer('c1')
    apiMock.listCredits.mockResolvedValueOnce([credit('cr1', '100.00', 'partial')])
    apiMock.listCreditPayments.mockResolvedValue([{ id: 'p1', amount: '40.00' }])
    await s.registerCreditPayment('cr1', { amount: '40.00', method: 'cash', employee_id: 'e1' })
    expect(apiMock.registerCreditPayment).toHaveBeenCalledWith('cr1', {
      amount: '40.00',
      method: 'cash',
      employee_id: 'e1',
    })
    expect(s.credits[0]?.payment_status).toBe('partial')
    expect(s.paymentsOf('cr1')).toHaveLength(1)
  })
})
