import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const ordersMock = vi.hoisted(() => ({
  listRefunds: vi.fn<(...a: unknown[]) => unknown>(),
  confirmRefund: vi.fn<(...a: unknown[]) => unknown>(),
  cancelRefund: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/orders.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...ordersMock }
})

const cashMock = vi.hoisted(() => ({
  getOpenSession: vi.fn<(...a: unknown[]) => unknown>(),
  listMovements: vi.fn<(...a: unknown[]) => unknown>(),
  getSessionSummary: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/cash.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...cashMock }
})

import { useCashStore } from '../cash'

const refund = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  order_id: 'o1',
  branch_id: 'b1',
  amount: '25000.00',
  method: 'transfer',
  status: 'pending',
  resolved_by_employee_id: null,
  resolved_at: null,
  reason: null,
  created_at: '2026-07-30T10:00:00Z',
  ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  ordersMock.listRefunds.mockResolvedValue([refund()])
})

describe('pending refunds in the cash station', () => {
  it('lists the branch pending refunds with the method the money arrived by', async () => {
    const store = useCashStore()
    await store.loadRefunds('b1')

    expect(ordersMock.listRefunds).toHaveBeenCalledWith('b1', 'pending')
    expect(store.pendingRefunds).toHaveLength(1)
    // Devolver una transferencia como efectivo rompería el arqueo; el método viaja siempre.
    expect(store.pendingRefunds[0]!.method).toBe('transfer')
  })

  it('confirming removes it from the pending list', async () => {
    const store = useCashStore()
    store.branchId = 'b1'
    await store.loadRefunds('b1')
    ordersMock.confirmRefund.mockResolvedValue(refund({ status: 'done' }))
    ordersMock.listRefunds.mockResolvedValue([])

    const ok = await store.confirmRefund('r1', 'e1')

    expect(ok).toBe(true)
    expect(store.pendingRefunds).toEqual([])
    expect(store.refundsError).toBeNull()
  })

  it('cancelling without a reason is refused before hitting the API', async () => {
    const store = useCashStore()

    const ok = await store.cancelRefund('r1', 'e1', '   ')

    expect(ok).toBe(false)
    expect(ordersMock.cancelRefund).not.toHaveBeenCalled()
    // Decidir NO devolver un dinero cobrado tiene que dejar por qué.
    expect(store.refundsError).toContain('motivo')
  })

  it('cancelling with a reason trims it and refreshes', async () => {
    const store = useCashStore()
    store.branchId = 'b1'
    ordersMock.cancelRefund.mockResolvedValue(refund({ status: 'cancelled' }))
    ordersMock.listRefunds.mockResolvedValue([])

    const ok = await store.cancelRefund('r1', 'e1', '  se reenvió mañana  ')

    expect(ok).toBe(true)
    expect(ordersMock.cancelRefund).toHaveBeenCalledWith('r1', 'e1', 'se reenvió mañana')
  })

  it('surfaces the server reason when a confirmation fails', async () => {
    const store = useCashStore()
    ordersMock.confirmRefund.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'conflict', detail: 'No hay sesión de caja abierta.' },
      },
    })

    expect(await store.confirmRefund('r1', 'e1')).toBe(false)
    expect(store.refundsError).toContain('No hay sesión de caja abierta')
  })
})
