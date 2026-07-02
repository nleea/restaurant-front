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

import * as api from '../delivery.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('delivery api layer', () => {
  it('lists routes scoped to a branch', async () => {
    get.mockResolvedValue({ data: [{ id: 'r1', name: 'Norte' }] })
    await api.listRoutes('b1')
    expect(get).toHaveBeenCalledWith('/delivery/routes', { params: { branch_id: 'b1' } })
  })

  it('creates and updates (deactivates) a route with zones and color', async () => {
    post.mockResolvedValue({ data: { id: 'r1' } })
    patch.mockResolvedValue({ data: { id: 'r1', is_active: false } })
    await api.createRoute({
      branch_id: 'b1',
      name: 'Norte',
      zones: ['Centro', 'Chapinero'],
      color: '#2563EB',
    })
    await api.updateRoute('r1', { is_active: false })
    expect(post).toHaveBeenCalledWith('/delivery/routes', {
      branch_id: 'b1',
      name: 'Norte',
      zones: ['Centro', 'Chapinero'],
      color: '#2563EB',
    })
    expect(patch).toHaveBeenCalledWith('/delivery/routes/r1', { is_active: false })
  })

  it('reads and updates the branch delivery settings', async () => {
    get.mockResolvedValue({
      data: { id: 's1', branch_id: 'b1', latitude: null, longitude: null, ring_step_km: '1.00' },
    })
    patch.mockResolvedValue({ data: { id: 's1', ring_step_km: '1.50' } })
    const settings = await api.getSettings('b1')
    expect(get).toHaveBeenCalledWith('/delivery/branches/b1/settings')
    expect(settings.latitude).toBeNull()
    await api.updateSettings('b1', { latitude: '6.2442', longitude: '-75.5812' })
    expect(patch).toHaveBeenCalledWith('/delivery/branches/b1/settings', {
      latitude: '6.2442',
      longitude: '-75.5812',
    })
  })

  it('lists, assigns and removes route drivers', async () => {
    get.mockResolvedValue({ data: [{ id: 'd1' }] })
    post.mockResolvedValue({ data: { id: 'd1' } })
    del.mockResolvedValue({ data: undefined })
    await api.listDrivers('r1')
    expect(get).toHaveBeenCalledWith('/delivery/routes/r1/drivers')
    await api.assignDriver('r1', { employee_id: 'e1' })
    expect(post).toHaveBeenCalledWith('/delivery/routes/r1/drivers', { employee_id: 'e1' })
    await api.removeDriver('r1', 'e1')
    expect(del).toHaveBeenCalledWith('/delivery/routes/r1/drivers/e1')
  })
})
