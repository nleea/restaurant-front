import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
const patch = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
}))

import * as api from '../delivery.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
})

describe('delivery dispatch api layer', () => {
  it('creates and lists deliveries with the status filter', async () => {
    post.mockResolvedValue({ data: { id: 'd1', delivery_status: 'pending' } })
    get.mockResolvedValue({ data: [] })
    await api.createDelivery({ order_id: 'o1', address_text: 'Cra 1 #2-3' })
    expect(post).toHaveBeenCalledWith('/delivery/deliveries', {
      order_id: 'o1',
      address_text: 'Cra 1 #2-3',
    })
    await api.listDeliveries()
    expect(get).toHaveBeenCalledWith('/delivery/deliveries', { params: undefined })
    await api.listDeliveries('in_transit')
    expect(get).toHaveBeenLastCalledWith('/delivery/deliveries', {
      params: { status_filter: 'in_transit' },
    })
  })

  it('gets an order delivery and updates an address', async () => {
    get.mockResolvedValue({ data: { id: 'd1' } })
    patch.mockResolvedValue({ data: { id: 'd1' } })
    await api.getOrderDelivery('o1')
    expect(get).toHaveBeenCalledWith('/delivery/orders/o1/delivery')
    await api.updateDelivery('d1', { neighborhood: 'Centro' })
    expect(patch).toHaveBeenCalledWith('/delivery/deliveries/d1', { neighborhood: 'Centro' })
    await api.updateDelivery('d1', { latitude: '11.5442000', longitude: '-72.9075000' })
    expect(patch).toHaveBeenLastCalledWith('/delivery/deliveries/d1', {
      latitude: '11.5442000',
      longitude: '-72.9075000',
    })
  })

  it('creates and lists runs', async () => {
    post.mockResolvedValue({ data: { id: 'run1', status: 'preparing' } })
    get.mockResolvedValue({ data: [] })
    await api.createRun({ delivery_route_id: 'r1', employee_id: 'e1' })
    expect(post).toHaveBeenCalledWith('/delivery/runs', {
      delivery_route_id: 'r1',
      employee_id: 'e1',
    })
    await api.listRuns('preparing')
    expect(get).toHaveBeenLastCalledWith('/delivery/runs', { params: { status_filter: 'preparing' } })
  })

  it('drives the lifecycle transitions', async () => {
    post.mockResolvedValue({ data: { id: 'x' } })
    await api.assignDelivery('d1', { delivery_run_id: 'run1' })
    expect(post).toHaveBeenCalledWith('/delivery/deliveries/d1/assign', { delivery_run_id: 'run1' })
    await api.departRun('run1')
    expect(post).toHaveBeenLastCalledWith('/delivery/runs/run1/depart')
    await api.markDelivered('d1', true)
    expect(post).toHaveBeenLastCalledWith('/delivery/deliveries/d1/mark-delivered', { delivered: true })
    await api.markDelivered('d1', false)
    expect(post).toHaveBeenLastCalledWith('/delivery/deliveries/d1/mark-delivered', { delivered: false })
    await api.finishRun('run1')
    expect(post).toHaveBeenLastCalledWith('/delivery/runs/run1/finish')
  })
})
