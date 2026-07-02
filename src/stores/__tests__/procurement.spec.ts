import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listRequests: vi.fn<(...a: unknown[]) => unknown>(),
  listRequestItems: vi.fn<(...a: unknown[]) => unknown>(),
  createRequest: vi.fn<(...a: unknown[]) => unknown>(),
  approveRequest: vi.fn<(...a: unknown[]) => unknown>(),
  rejectRequest: vi.fn<(...a: unknown[]) => unknown>(),
  listOrders: vi.fn<(...a: unknown[]) => unknown>(),
  listOrderItems: vi.fn<(...a: unknown[]) => unknown>(),
  createOrder: vi.fn<(...a: unknown[]) => unknown>(),
  receiveOrder: vi.fn<(...a: unknown[]) => unknown>(),
  registerPayment: vi.fn<(...a: unknown[]) => unknown>(),
  listPayments: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/purchasing.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

const branchMock = vi.hoisted(() => ({ activeBranchId: 'b1' }))
vi.mock('@/stores/branch', () => ({ useBranchStore: () => branchMock }))

import { useProcurementStore } from '../procurement'

const order = (id: string, total: string, branch = 'b1') => ({
  id,
  branch_id: branch,
  purchase_request_id: 'r1',
  supplier_id: 'sup1',
  status: 'created',
  payment_status: 'pending',
  total,
})
const orderItem = (id: string, ordered: string, received: string) => ({
  id,
  purchase_order_id: 'o1',
  ingredient_id: 'i1',
  ordered_quantity: ordered,
  received_quantity: received,
  unit_price: '2000.00',
  unit_of_measure_id: 'u-kg',
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
  branchMock.activeBranchId = 'b1'
})

describe('procurement store', () => {
  it('scopes requests and orders to the active branch', async () => {
    apiMock.listRequests.mockResolvedValue([
      { id: 'r1', branch_id: 'b1', status: 'pending' },
      { id: 'r2', branch_id: 'bX', status: 'pending' },
    ])
    apiMock.listOrders.mockResolvedValue([order('o1', '100.00', 'b1'), order('o2', '5.00', 'bX')])
    const p = useProcurementStore()
    await p.loadRequests()
    await p.loadOrders()
    expect(p.branchRequests.map((r) => r.id)).toEqual(['r1'])
    expect(p.branchOrders.map((o) => o.id)).toEqual(['o1'])
  })

  it('approving a request write-through refetches the list', async () => {
    apiMock.listRequests.mockResolvedValue([{ id: 'r1', branch_id: 'b1', status: 'approved' }])
    const p = useProcurementStore()
    await p.approveRequest('r1', 'e2')
    expect(apiMock.approveRequest).toHaveBeenCalledWith('r1', { employee_id: 'e2' })
    expect(p.requests[0]?.status).toBe('approved')
  })

  it('receiving an order refetches the order and its items', async () => {
    apiMock.listOrders.mockResolvedValue([{ ...order('o1', '100.00'), status: 'partially_received' }])
    apiMock.listOrderItems.mockResolvedValue([orderItem('oi1', '5.000', '3.000')])
    const p = useProcurementStore()
    await p.receiveOrder('o1', {
      received_by_employee_id: 'e1',
      items: [{ order_item_id: 'oi1', quantity: '3.000' }],
    })
    expect(apiMock.receiveOrder).toHaveBeenCalled()
    expect(p.orders[0]?.status).toBe('partially_received')
    expect(p.itemsOfOrder('o1')[0]?.received_quantity).toBe('3.000')
  })

  it('derives outstanding balance from payments in integer cents', async () => {
    apiMock.listOrders.mockResolvedValue([order('o1', '10000.00')])
    apiMock.listOrderItems.mockResolvedValue([])
    apiMock.listPayments.mockResolvedValue([{ id: 'p1', amount: '4000.50' }, { id: 'p2', amount: '500.50' }])
    const p = useProcurementStore()
    await p.loadOrders()
    await p.selectOrder('o1')
    // 10000 − (4000.50 + 500.50) = 5499.00
    expect(p.outstandingBalance('o1')).toBe('5499.00')
  })

  it('registering a payment refetches order and payments', async () => {
    apiMock.listOrders.mockResolvedValue([{ ...order('o1', '10000.00'), payment_status: 'partial' }])
    apiMock.listPayments.mockResolvedValue([{ id: 'p1', amount: '5000.00' }])
    const p = useProcurementStore()
    await p.registerPayment('o1', { amount: '5000.00', method: 'transfer', employee_id: 'e1' })
    expect(apiMock.registerPayment).toHaveBeenCalledWith('o1', {
      amount: '5000.00',
      method: 'transfer',
      employee_id: 'e1',
    })
    expect(p.orders[0]?.payment_status).toBe('partial')
    expect(p.paymentsOf('o1')).toHaveLength(1)
  })

  it('computes receipt progress for an item', () => {
    const p = useProcurementStore()
    const prog = p.receiptProgress(orderItem('oi1', '5.000', '2.000'))
    expect(prog.remaining).toBe(3)
    expect(prog.done).toBe(false)
    const full = p.receiptProgress(orderItem('oi2', '5.000', '5.000'))
    expect(full.done).toBe(true)
  })
})
