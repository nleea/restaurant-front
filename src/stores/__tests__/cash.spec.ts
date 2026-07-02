import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  openSession: vi.fn<(...a: unknown[]) => unknown>(),
  listSessions: vi.fn<(...a: unknown[]) => unknown>(),
  getOpenSession: vi.fn<(...a: unknown[]) => unknown>(),
  getSession: vi.fn<(...a: unknown[]) => unknown>(),
  closeSession: vi.fn<(...a: unknown[]) => unknown>(),
  registerMovement: vi.fn<(...a: unknown[]) => unknown>(),
  listMovements: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/cash.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

import { useCashStore } from '../cash'

const SESSION = {
  id: 's1',
  branch_id: 'b1',
  opened_by_employee_id: 'e1',
  opening_amount: '50000.00',
  status: 'open',
  opened_at: '2026-06-25T12:00:00Z',
  closed_by_employee_id: null,
  counted_amount: null,
  expected_amount: null,
  difference: null,
  closed_at: null,
}
const movement = (type: string, amount: string, method = 'cash') => ({
  id: `m-${type}-${amount}-${method}`,
  branch_id: 'b1',
  cash_session_id: 's1',
  type,
  concept: 'x',
  amount,
  method,
  reference_id: null,
})

// A 404-shaped error like axios produces, for the "no open session" path.
const notFound = Object.assign(new Error('not found'), { response: { status: 404 } })

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('cash store', () => {
  it('loads an open session and its movements for the branch', async () => {
    apiMock.getOpenSession.mockResolvedValue(SESSION)
    apiMock.listMovements.mockResolvedValue([movement('in', '10000.00')])
    const cash = useCashStore()
    await cash.loadBranchCash('b1')
    expect(apiMock.getOpenSession).toHaveBeenCalledWith('b1')
    expect(cash.hasOpenSession).toBe(true)
    expect(cash.currentMovements).toHaveLength(1)
  })

  it('maps a 404 open-session lookup to "no open session" rather than an error', async () => {
    apiMock.getOpenSession.mockRejectedValue(notFound)
    const cash = useCashStore()
    await cash.loadBranchCash('b1')
    expect(cash.currentSession).toBeNull()
    expect(cash.hasOpenSession).toBe(false)
    expect(apiMock.listMovements).not.toHaveBeenCalled()
  })

  it('propagates non-404 errors from the open-session lookup', async () => {
    apiMock.getOpenSession.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    )
    const cash = useCashStore()
    await expect(cash.loadBranchCash('b1')).rejects.toThrow('boom')
  })

  it('computes running expected cash from cash movements only, in integer cents', async () => {
    apiMock.getOpenSession.mockResolvedValue(SESSION)
    apiMock.listMovements.mockResolvedValue([
      movement('in', '10000.00', 'cash'), // +10000
      movement('out', '4000.50', 'cash'), // −4000.50
      movement('in', '25000.00', 'card'), // excluded (non-cash)
      movement('out', '9999.00', 'nequi'), // excluded (non-cash)
    ])
    const cash = useCashStore()
    await cash.loadBranchCash('b1')
    // 50000 + 10000 − 4000.50 = 55999.50
    expect(cash.runningExpectedCash).toBe('55999.50')
  })

  it('returns null running expected cash when no session is open', () => {
    const cash = useCashStore()
    expect(cash.runningExpectedCash).toBeNull()
  })

  it('summarises open-session movements per method', async () => {
    apiMock.getOpenSession.mockResolvedValue(SESSION)
    apiMock.listMovements.mockResolvedValue([
      movement('in', '10000.00', 'cash'),
      movement('out', '2000.00', 'cash'),
      movement('in', '25000.00', 'card'),
    ])
    const cash = useCashStore()
    await cash.loadBranchCash('b1')
    const cashRow = cash.movementsByMethod.find((r) => r.method === 'cash')
    const cardRow = cash.movementsByMethod.find((r) => r.method === 'card')
    expect(cashRow).toEqual({ method: 'cash', inTotal: '10000.00', outTotal: '2000.00' })
    expect(cardRow).toEqual({ method: 'card', inTotal: '25000.00', outTotal: '0.00' })
  })

  it('opens a session and clears any prior ledger', async () => {
    apiMock.openSession.mockResolvedValue(SESSION)
    const cash = useCashStore()
    await cash.openSession({
      branch_id: 'b1',
      opened_by_employee_id: 'e1',
      opening_amount: '50000.00',
    })
    expect(apiMock.openSession).toHaveBeenCalled()
    expect(cash.currentSession?.id).toBe('s1')
    expect(cash.currentMovements).toEqual([])
  })

  it('registering a movement write-through refetches the ledger', async () => {
    apiMock.getOpenSession.mockResolvedValue(SESSION)
    apiMock.listMovements.mockResolvedValueOnce([]).mockResolvedValueOnce([movement('in', '5000.00')])
    const cash = useCashStore()
    await cash.loadBranchCash('b1')
    await cash.registerMovement({ type: 'in', concept: 'Fondo', amount: '5000.00', method: 'cash' })
    expect(apiMock.registerMovement).toHaveBeenCalledWith('s1', {
      type: 'in',
      concept: 'Fondo',
      amount: '5000.00',
      method: 'cash',
    })
    expect(cash.currentMovements).toHaveLength(1)
  })

  it('closing a session clears it, refreshes history, and selects the closed session', async () => {
    apiMock.getOpenSession.mockResolvedValue(SESSION)
    apiMock.listMovements.mockResolvedValue([])
    const closed = { ...SESSION, status: 'closed', counted_amount: '60000.00', expected_amount: '60000.00', difference: '0.00' }
    apiMock.closeSession.mockResolvedValue(closed)
    apiMock.listSessions.mockResolvedValue([closed])
    apiMock.getSession.mockResolvedValue(closed)
    const cash = useCashStore()
    await cash.loadBranchCash('b1')
    const result = await cash.closeSession({ closed_by_employee_id: 'e2', counted_amount: '60000.00' })
    expect(apiMock.closeSession).toHaveBeenCalledWith('s1', {
      closed_by_employee_id: 'e2',
      counted_amount: '60000.00',
    })
    expect(result.difference).toBe('0.00')
    expect(cash.currentSession).toBeNull()
    expect(cash.history).toHaveLength(1)
    expect(cash.selectedSession?.status).toBe('closed')
  })

  it('loads a session detail with its movements', async () => {
    apiMock.getSession.mockResolvedValue(SESSION)
    apiMock.listMovements.mockResolvedValue([movement('in', '1000.00')])
    const cash = useCashStore()
    await cash.selectSession('s1')
    expect(cash.selectedSessionId).toBe('s1')
    expect(cash.selectedSession?.id).toBe('s1')
    expect(cash.selectedMovements).toHaveLength(1)
  })
})
