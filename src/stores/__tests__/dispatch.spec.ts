import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  createDelivery: vi.fn<(...a: unknown[]) => unknown>(),
  listDeliveries: vi.fn<(...a: unknown[]) => unknown>(),
  updateDelivery: vi.fn<(...a: unknown[]) => unknown>(),
  createRun: vi.fn<(...a: unknown[]) => unknown>(),
  listRuns: vi.fn<(...a: unknown[]) => unknown>(),
  assignDelivery: vi.fn<(...a: unknown[]) => unknown>(),
  departRun: vi.fn<(...a: unknown[]) => unknown>(),
  markDelivered: vi.fn<(...a: unknown[]) => unknown>(),
  finishRun: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/delivery.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

import { useDispatchStore } from '../dispatch'

const delivery = (
  id: string,
  status: string,
  runId: string | null = null,
  extra: Partial<{ route_position: number | null; created_at: string | null }> = {},
) => ({
  id,
  order_id: `o-${id}`,
  delivery_route_id: null,
  delivery_run_id: runId,
  address_text: 'Cra 1',
  neighborhood: null,
  latitude: null,
  longitude: null,
  delivery_status: status,
  route_position: null,
  notes: null,
  delivered_at: null,
  created_at: null,
  ...extra,
})
const run = (id: string, status: string) => ({
  id,
  delivery_route_id: 'r1',
  employee_id: 'e1',
  status,
  departed_at: null,
  finished_at: null,
  created_at: null,
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('dispatch store', () => {
  it('groups deliveries and runs by status, and a run’s deliveries', async () => {
    apiMock.listDeliveries.mockResolvedValue([
      delivery('d1', 'pending'),
      delivery('d2', 'assigned', 'run1'),
      delivery('d3', 'in_transit', 'run1'),
    ])
    apiMock.listRuns.mockResolvedValue([run('run1', 'preparing'), run('run2', 'finished')])
    const s = useDispatchStore()
    await s.loadDeliveries()
    await s.loadRuns()
    expect(s.pendingDeliveries.map((d) => d.id)).toEqual(['d1'])
    expect(s.preparingRuns.map((r) => r.id)).toEqual(['run1'])
    expect(s.deliveriesOfRun('run1').map((d) => d.id)).toEqual(['d2', 'd3'])
    expect(s.deliveriesByStatus('in_transit').map((d) => d.id)).toEqual(['d3'])
  })

  it('assigning a delivery write-through refetches deliveries', async () => {
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'assigned', 'run1')])
    const s = useDispatchStore()
    await s.assignDelivery('d1', 'run1')
    expect(apiMock.assignDelivery).toHaveBeenCalledWith('d1', { delivery_run_id: 'run1' })
    expect(s.deliveries[0]?.delivery_status).toBe('assigned')
  })

  it('departing a run refetches both runs and deliveries (cascade)', async () => {
    apiMock.listRuns.mockResolvedValue([run('run1', 'in_transit')])
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'in_transit', 'run1')])
    const s = useDispatchStore()
    await s.departRun('run1')
    expect(apiMock.departRun).toHaveBeenCalledWith('run1')
    expect(apiMock.listRuns).toHaveBeenCalled()
    expect(apiMock.listDeliveries).toHaveBeenCalled()
    expect(s.runs[0]?.status).toBe('in_transit')
    expect(s.deliveries[0]?.delivery_status).toBe('in_transit')
  })

  it('marking a delivery delivered write-through refetches deliveries', async () => {
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'delivered', 'run1')])
    const s = useDispatchStore()
    await s.markDelivered('d1', true)
    expect(apiMock.markDelivered).toHaveBeenCalledWith('d1', true)
    expect(s.deliveries[0]?.delivery_status).toBe('delivered')
  })

  it('finishing a run write-through refetches runs', async () => {
    apiMock.listRuns.mockResolvedValue([run('run1', 'finished')])
    const s = useDispatchStore()
    await s.finishRun('run1')
    expect(apiMock.finishRun).toHaveBeenCalledWith('run1')
    expect(s.runs[0]?.status).toBe('finished')
  })

  it('orders a run’s stops by route_position, then creation time', async () => {
    apiMock.listDeliveries.mockResolvedValue([
      delivery('d-late', 'assigned', 'run1', { created_at: '2026-07-03T15:00:00Z' }),
      delivery('d-early', 'assigned', 'run1', { created_at: '2026-07-03T14:00:00Z' }),
      delivery('d-pos1', 'assigned', 'run1', { route_position: 1 }),
      delivery('d-pos0', 'assigned', 'run1', { route_position: 0 }),
    ])
    const s = useDispatchStore()
    await s.loadDeliveries()
    expect(s.deliveriesOfRun('run1').map((d) => d.id)).toEqual([
      'd-pos0',
      'd-pos1',
      'd-early',
      'd-late',
    ])
  })

  it('computes run progress from its stops', async () => {
    apiMock.listDeliveries.mockResolvedValue([
      delivery('d1', 'delivered', 'run1'),
      delivery('d2', 'in_transit', 'run1'),
      delivery('d3', 'in_transit', 'run1'),
      delivery('d4', 'pending'),
    ])
    const s = useDispatchStore()
    await s.loadDeliveries()
    expect(s.runProgress('run1')).toEqual({ delivered: 1, total: 3 })
  })

  it('updating notes write-through refetches deliveries', async () => {
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'pending')])
    const s = useDispatchStore()
    await s.updateDeliveryNotes('d1', 'portón negro')
    expect(apiMock.updateDelivery).toHaveBeenCalledWith('d1', { notes: 'portón negro' })
    expect(apiMock.listDeliveries).toHaveBeenCalled()
  })

  it('creating a delivery and a run write-through refetch their lists', async () => {
    apiMock.createDelivery.mockResolvedValue(delivery('d9', 'pending'))
    apiMock.listDeliveries.mockResolvedValue([delivery('d9', 'pending')])
    apiMock.createRun.mockResolvedValue(run('run9', 'preparing'))
    apiMock.listRuns.mockResolvedValue([run('run9', 'preparing')])
    const s = useDispatchStore()
    await s.createDelivery({ order_id: 'o9', address_text: 'Cra 1' })
    await s.createRun({ delivery_route_id: 'r1', employee_id: 'e1' })
    expect(s.deliveries).toHaveLength(1)
    expect(s.runs).toHaveLength(1)
  })
})
