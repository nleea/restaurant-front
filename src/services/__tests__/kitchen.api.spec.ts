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

import * as api from '../kitchen.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('kitchen api layer', () => {
  it('lists stations scoped to a branch', async () => {
    get.mockResolvedValue({ data: [{ id: 's1', branch_id: 'b1', name: 'Plancha' }] })
    const stations = await api.listStations('b1')
    expect(get).toHaveBeenCalledWith('/kitchen/stations', { params: { branch_id: 'b1' } })
    expect(stations).toHaveLength(1)
  })

  it('creates and updates a station', async () => {
    post.mockResolvedValue({ data: { id: 's1' } })
    patch.mockResolvedValue({ data: { id: 's1', position: 2 } })
    await api.createStation({ branch_id: 'b1', name: 'Fríos', position: 1 })
    await api.updateStation('s1', { position: 2 })
    expect(post).toHaveBeenCalledWith('/kitchen/stations', {
      branch_id: 'b1',
      name: 'Fríos',
      position: 1,
    })
    expect(patch).toHaveBeenCalledWith('/kitchen/stations/s1', { position: 2 })
  })

  it('attaches and detaches product↔station mappings', async () => {
    post.mockResolvedValue({ data: { id: 'm1' } })
    del.mockResolvedValue({ data: undefined })
    await api.attachProductStation({ product_id: 'p1', kitchen_station_id: 's1' })
    await api.detachProductStation('p1', 's1')
    expect(post).toHaveBeenCalledWith('/kitchen/product-stations', {
      product_id: 'p1',
      kitchen_station_id: 's1',
    })
    expect(del).toHaveBeenCalledWith('/kitchen/products/p1/stations/s1')
  })

  it('routes an order to the kitchen', async () => {
    post.mockResolvedValue({ data: [{ id: 't1' }] })
    const tickets = await api.routeOrder('o1')
    expect(post).toHaveBeenCalledWith('/kitchen/orders/o1/route')
    expect(tickets).toHaveLength(1)
  })

  it('lists tickets, passing status_filter only when given', async () => {
    get.mockResolvedValue({ data: [] })
    await api.listTickets('s1')
    expect(get).toHaveBeenCalledWith('/kitchen/stations/s1/tickets', { params: undefined })
    await api.listTickets('s1', 'pending')
    expect(get).toHaveBeenLastCalledWith('/kitchen/stations/s1/tickets', {
      params: { status_filter: 'pending' },
    })
  })

  it('advances a ticket', async () => {
    post.mockResolvedValue({ data: { id: 't1', status: 'in_progress' } })
    const ticket = await api.advanceTicket('t1')
    expect(post).toHaveBeenCalledWith('/kitchen/tickets/t1/advance')
    expect(ticket.status).toBe('in_progress')
  })
})
