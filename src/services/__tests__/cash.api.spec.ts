import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
  },
}))

import * as api from '../cash.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('cash api layer', () => {
  it('opens a session', async () => {
    post.mockResolvedValue({ data: { id: 's1', status: 'open' } })
    const session = await api.openSession({
      branch_id: 'b1',
      opened_by_employee_id: 'e1',
      opening_amount: '50000.00',
    })
    expect(post).toHaveBeenCalledWith('/cash/sessions', {
      branch_id: 'b1',
      opened_by_employee_id: 'e1',
      opening_amount: '50000.00',
    })
    expect(session.status).toBe('open')
  })

  it('lists sessions scoped to a branch, passing status_filter only when given', async () => {
    get.mockResolvedValue({ data: [] })
    await api.listSessions('b1')
    expect(get).toHaveBeenCalledWith('/cash/sessions', { params: { branch_id: 'b1' } })
    await api.listSessions('b1', 'closed')
    expect(get).toHaveBeenLastCalledWith('/cash/sessions', {
      params: { branch_id: 'b1', status_filter: 'closed' },
    })
  })

  it('gets the branch open session and a session by id', async () => {
    get.mockResolvedValue({ data: { id: 's1' } })
    await api.getOpenSession('b1')
    expect(get).toHaveBeenCalledWith('/cash/branches/b1/open-session')
    await api.getSession('s1')
    expect(get).toHaveBeenLastCalledWith('/cash/sessions/s1')
  })

  it('closes a session with the counted amount', async () => {
    post.mockResolvedValue({ data: { id: 's1', status: 'closed', difference: '-1000.00' } })
    const session = await api.closeSession('s1', {
      closed_by_employee_id: 'e2',
      counted_amount: '61000.00',
    })
    expect(post).toHaveBeenCalledWith('/cash/sessions/s1/close', {
      closed_by_employee_id: 'e2',
      counted_amount: '61000.00',
    })
    expect(session.difference).toBe('-1000.00')
  })

  it('registers a movement and lists movements for a session', async () => {
    post.mockResolvedValue({ data: { id: 'm1', type: 'in' } })
    get.mockResolvedValue({ data: [{ id: 'm1' }] })
    await api.registerMovement('s1', {
      type: 'in',
      concept: 'Fondo extra',
      amount: '10000.00',
      method: 'cash',
    })
    expect(post).toHaveBeenCalledWith('/cash/sessions/s1/movements', {
      type: 'in',
      concept: 'Fondo extra',
      amount: '10000.00',
      method: 'cash',
    })
    const movements = await api.listMovements('s1')
    expect(get).toHaveBeenCalledWith('/cash/sessions/s1/movements')
    expect(movements).toHaveLength(1)
  })
})
