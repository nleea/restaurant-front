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

const cashMock = vi.hoisted(() => ({
  getOpenSession: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/cash.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...cashMock }
})

import { useDispatchStore } from '../dispatch'

const delivery = (
  id: string,
  status: string,
  runId: string | null = null,
  extra: Partial<{
    route_position: number | null
    created_at: string | null
    kitchen_state: string | null
  }> = {},
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
  // Cocinado por defecto: estos tests agrupan por estado de entrega, no prueban el gate
  // de cocina (que tiene el suyo en deliveryAssignable.spec).
  kitchen_state: 'ready',
  // Sin cotizar por defecto: estos tests agrupan por estado de ENTREGA. Lo del domicilio tiene
  // su propio archivo (quoteStatus.spec).
  quote_status: 'pending_quote',
  quote_distance_km: null,
  quoted_fee: null,
  quote_failure_reason: null,
  emission_status: null,
  emission_failure_reason: null,
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
  cashMock.getOpenSession.mockReset()
  // Default: a caja is open (loadDeliveries probes it); closed-caja tests override this.
  cashMock.getOpenSession.mockResolvedValue({ id: 'cs1' })
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
    await s.loadDeliveries('b1')
    await s.loadRuns('b1')
    expect(s.pendingDeliveries.map((d) => d.id)).toEqual(['d1'])
    expect(s.preparingRuns.map((r) => r.id)).toEqual(['run1'])
    expect(s.deliveriesOfRun('run1').map((d) => d.id)).toEqual(['d2', 'd3'])
    expect(s.deliveriesByStatus('in_transit').map((d) => d.id)).toEqual(['d3'])
  })

  it('assigning a delivery write-through refetches deliveries', async () => {
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'assigned', 'run1')])
    const s = useDispatchStore()
    // A mutation can only follow a load, so the board's branch is already known.
    s.branchId = 'b1'
    await s.assignDelivery('d1', 'run1')
    expect(apiMock.assignDelivery).toHaveBeenCalledWith('d1', { delivery_run_id: 'run1' })
    expect(s.deliveries[0]?.delivery_status).toBe('assigned')
  })

  it('departing a run refetches both runs and deliveries (cascade)', async () => {
    apiMock.listRuns.mockResolvedValue([run('run1', 'in_transit')])
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'in_transit', 'run1')])
    const s = useDispatchStore()
    // A mutation can only follow a load, so the board's branch is already known.
    s.branchId = 'b1'
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
    // A mutation can only follow a load, so the board's branch is already known.
    s.branchId = 'b1'
    await s.markDelivered('d1', true)
    expect(apiMock.markDelivered).toHaveBeenCalledWith('d1', true)
    expect(s.deliveries[0]?.delivery_status).toBe('delivered')
  })

  it('finishing a run write-through refetches runs', async () => {
    apiMock.listRuns.mockResolvedValue([run('run1', 'finished')])
    const s = useDispatchStore()
    // A mutation can only follow a load, so the board's branch is already known.
    s.branchId = 'b1'
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
    await s.loadDeliveries('b1')
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
    await s.loadDeliveries('b1')
    expect(s.runProgress('run1')).toEqual({ delivered: 1, total: 3 })
  })

  it('updating notes write-through refetches deliveries', async () => {
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'pending')])
    const s = useDispatchStore()
    // A mutation can only follow a load, so the board's branch is already known.
    s.branchId = 'b1'
    await s.updateDeliveryNotes('d1', 'portón negro')
    expect(apiMock.updateDelivery).toHaveBeenCalledWith('d1', { notes: 'portón negro' })
    expect(apiMock.listDeliveries).toHaveBeenCalled()
  })

  it('refetches within the branch it was loaded for', async () => {
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'pending')])
    const s = useDispatchStore()
    await s.loadDeliveries('b7')
    await s.markDelivered('d1', true)
    // The write-through carries no branch of its own — it must reuse the loaded one, or a
    // mutation would silently widen the board to the whole tenant. Live board scope is always on.
    expect(apiMock.listDeliveries).toHaveBeenLastCalledWith('b7', undefined, true)
  })

  it('scopes the board to the open cash session (open_session_only)', async () => {
    apiMock.listDeliveries.mockResolvedValue([delivery('d1', 'pending')])
    const s = useDispatchStore()
    await s.loadDeliveries('b1')
    // Third arg true → backend returns only the open shift's deliveries.
    expect(apiMock.listDeliveries).toHaveBeenLastCalledWith('b1', undefined, true)
    expect(s.cashSessionOpen).toBe(true)
  })

  it('flags caja cerrada when the branch has no open session', async () => {
    cashMock.getOpenSession.mockRejectedValue(new Error('404'))
    apiMock.listDeliveries.mockResolvedValue([])
    const s = useDispatchStore()
    await s.loadDeliveries('b1')
    expect(s.cashSessionOpen).toBe(false)
    expect(s.deliveries).toEqual([])
  })

  it('a refetch with no branch loaded does nothing rather than fetching tenant-wide', async () => {
    const s = useDispatchStore()
    await s.refetchDeliveries()
    await s.refetchRuns()
    expect(apiMock.listDeliveries).not.toHaveBeenCalled()
    expect(apiMock.listRuns).not.toHaveBeenCalled()
  })

  it('creating a delivery and a run write-through refetch their lists', async () => {
    apiMock.createDelivery.mockResolvedValue(delivery('d9', 'pending'))
    apiMock.listDeliveries.mockResolvedValue([delivery('d9', 'pending')])
    apiMock.createRun.mockResolvedValue(run('run9', 'preparing'))
    apiMock.listRuns.mockResolvedValue([run('run9', 'preparing')])
    const s = useDispatchStore()
    // A mutation can only follow a load, so the board's branch is already known.
    s.branchId = 'b1'
    await s.createDelivery({ order_id: 'o9', address_text: 'Cra 1' })
    await s.createRun({ delivery_route_id: 'r1', employee_id: 'e1' })
    expect(s.deliveries).toHaveLength(1)
    expect(s.runs).toHaveLength(1)
  })
})

describe('kitchen gate on the dispatch board', () => {
  it('offers only cooked deliveries to a run, but still shows the rest', () => {
    const store = useDispatchStore()
    store.deliveries = [
      delivery('cooked', 'pending'),
      delivery('cooking', 'pending', null, { kitchen_state: 'in_kitchen' }),
      delivery('untouched', 'pending', null, { kitchen_state: 'none' }),
    ]

    // Sólo lo cocinado llega a un picker de despacho.
    expect(store.pendingDeliveries.map((d) => d.id)).toEqual(['cooked'])
    // Pero las otras siguen visibles: al despachador le sirve saber qué viene.
    expect(store.notReadyDeliveries.map((d) => d.id)).toEqual(['cooking', 'untouched'])
    expect(store.deliveries).toHaveLength(3)
  })
})

describe('the kitchen gate lifts on its own', () => {
  it('a doorbell refetch turns a blocked delivery into an assignable one', async () => {
    const store = useDispatchStore()
    apiMock.listDeliveries.mockResolvedValue([
      delivery('d1', 'pending', null, { kitchen_state: 'in_kitchen' }),
    ])
    await store.loadDeliveries('b1')
    expect(store.pendingDeliveries).toHaveLength(0)
    expect(store.notReadyDeliveries).toHaveLength(1)

    // La cocina termina y suena el doorbell: el board refetchea, sin recargar la página.
    apiMock.listDeliveries.mockResolvedValue([
      delivery('d1', 'pending', null, { kitchen_state: 'ready' }),
    ])
    await store.refetchDeliveries()

    expect(store.pendingDeliveries.map((d) => d.id)).toEqual(['d1'])
    expect(store.notReadyDeliveries).toHaveLength(0)
  })
})
