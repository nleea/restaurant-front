import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listStations: vi.fn<(...a: unknown[]) => unknown>(),
  createStation: vi.fn<(...a: unknown[]) => unknown>(),
  updateStation: vi.fn<(...a: unknown[]) => unknown>(),
  listProductStations: vi.fn<(...a: unknown[]) => unknown>(),
  attachProductStation: vi.fn<(...a: unknown[]) => unknown>(),
  detachProductStation: vi.fn<(...a: unknown[]) => unknown>(),
  updateProductStation: vi.fn<(...a: unknown[]) => unknown>(),
  routeOrder: vi.fn<(...a: unknown[]) => unknown>(),
  listTickets: vi.fn<(...a: unknown[]) => unknown>(),
  advanceTicket: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/kitchen.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

const sseMock = vi.hoisted(() => ({
  createSseClient: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/lib/sse', () => ({
  createSseClient: (...a: unknown[]) => sseMock.createSseClient(...a),
}))

const ordersMock = vi.hoisted(() => ({
  buildVariantIndex: vi.fn<(...a: unknown[]) => unknown>(),
  loadOrders: vi.fn<(...a: unknown[]) => unknown>(),
  loadTables: vi.fn<(...a: unknown[]) => unknown>(),
  fetchItems: vi.fn<(...a: unknown[]) => unknown>(),
  itemLabel: (item: { product_variant_id: string }) =>
    item.product_variant_id === 'v1' ? 'Pizza · Grande' : '—',
  orders: [] as Array<{ id: string; channel: string; dining_table_id: string | null }>,
  tables: [] as Array<{ id: string; number: string }>,
  itemsByOrder: {} as Record<string, Array<{ id: string; product_variant_id: string; quantity: number }>>,
}))
vi.mock('@/stores/orders', () => ({ useOrdersStore: () => ordersMock }))

import { useKitchenStore } from '../kitchen'

const STATION = { id: 's1', branch_id: 'b1', name: 'Plancha', position: 0, is_active: true }
const ticket = (id: string, status: string, itemId = 'i1', role: string | null = null) => ({
  id,
  branch_id: 'b1',
  order_item_id: itemId,
  kitchen_station_id: 's1',
  status,
  entered_at: null,
  ready_at: null,
  role,
  tasks: [] as string[],
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
  sseMock.createSseClient.mockReset()
  ordersMock.buildVariantIndex.mockResolvedValue(undefined)
  ordersMock.loadOrders.mockResolvedValue(undefined)
  ordersMock.loadTables.mockResolvedValue(undefined)
  ordersMock.fetchItems.mockResolvedValue(undefined)
  ordersMock.orders = []
  ordersMock.tables = []
  ordersMock.itemsByOrder = {}
})

describe('kitchen store', () => {
  it('loads stations for the active branch', async () => {
    apiMock.listStations.mockResolvedValue([STATION])
    const k = useKitchenStore()
    await k.loadStations('b1')
    expect(apiMock.listStations).toHaveBeenCalledWith('b1')
    expect(k.stations).toHaveLength(1)
  })

  it('selectStation sets the selection and loads its tickets', async () => {
    apiMock.listTickets.mockResolvedValue([ticket('t1', 'pending')])
    const k = useKitchenStore()
    await k.selectStation('s1')
    expect(k.selectedStationId).toBe('s1')
    expect(apiMock.listTickets).toHaveBeenCalledWith('s1')
    expect(k.ticketsOf('s1')).toHaveLength(1)
  })

  it('advanceTicket write-through refetches the station the response points at', async () => {
    apiMock.advanceTicket.mockResolvedValue(ticket('t1', 'in_progress'))
    apiMock.listTickets.mockResolvedValue([ticket('t1', 'in_progress')])
    const k = useKitchenStore()
    await k.advanceTicket('t1')
    expect(apiMock.advanceTicket).toHaveBeenCalledWith('t1')
    expect(apiMock.listTickets).toHaveBeenCalledWith('s1')
    expect(k.ticketsOf('s1')[0]?.status).toBe('in_progress')
  })

  it('routeOrder write-through refreshes the whole board', async () => {
    apiMock.routeOrder.mockResolvedValue([ticket('t9', 'pending')])
    apiMock.listTickets.mockResolvedValue([ticket('t9', 'pending')])
    const k = useKitchenStore()
    k.stations = [STATION]
    await k.routeOrder('o1')
    expect(apiMock.routeOrder).toHaveBeenCalledWith('o1')
    expect(apiMock.listTickets).toHaveBeenCalledWith('s1')
    expect(k.ticketsOf('s1')).toHaveLength(1)
  })

  it('bumpTickets advances each ticket to ready, then refreshes the board once', async () => {
    apiMock.advanceTicket.mockResolvedValue(ticket('tX', 'ready'))
    apiMock.listTickets.mockResolvedValue([])
    const k = useKitchenStore()
    k.stations = [STATION]
    await k.bumpTickets([
      { id: 't1', status: 'pending' },
      { id: 't2', status: 'in_progress' },
      { id: 't3', status: 'ready' },
    ])
    // pending needs two forward steps, in_progress one, ready none
    expect(apiMock.advanceTicket.mock.calls.map((c) => c[0])).toEqual(['t1', 't1', 't2'])
    expect(apiMock.listTickets).toHaveBeenCalledTimes(1)
  })

  it('bumpTickets refreshes the board even when an advance fails midway', async () => {
    apiMock.advanceTicket.mockRejectedValue(new Error('409'))
    apiMock.listTickets.mockResolvedValue([ticket('t1', 'in_progress')])
    const k = useKitchenStore()
    k.stations = [STATION]
    await expect(k.bumpTickets([{ id: 't1', status: 'in_progress' }])).rejects.toThrow('409')
    // the finally refetch still ran, so the board shows server truth
    expect(apiMock.listTickets).toHaveBeenCalledWith('s1')
  })

  it('pollBoard keeps the last good tickets when the fetch fails', async () => {
    const k = useKitchenStore()
    k.stations = [STATION]
    k.ticketsByStation = { s1: [ticket('t1', 'pending')] }
    apiMock.listTickets.mockRejectedValue(new Error('network'))
    await k.pollBoard('b1')
    expect(k.ticketsOf('s1')).toHaveLength(1)
  })

  it('pollBoard rebuilds the item index only when an unknown order item appears', async () => {
    const k = useKitchenStore()
    k.stations = [STATION]
    k.itemIndex = {
      i1: { label: 'Pizza', quantity: 1, orderId: 'o1', channel: 'dine_in', tableNumber: '5', variantId: null },
    }
    apiMock.listTickets.mockResolvedValue([ticket('t1', 'pending', 'i1')])
    await k.pollBoard('b1')
    expect(ordersMock.loadOrders).not.toHaveBeenCalled()

    apiMock.listTickets.mockResolvedValue([ticket('t2', 'pending', 'i-new')])
    await k.pollBoard('b1')
    expect(ordersMock.loadOrders).toHaveBeenCalledWith('b1', 'open')
  })

  it('attachProduct write-through reloads that product mappings (role defaults to null)', async () => {
    apiMock.attachProductStation.mockResolvedValue({ id: 'm1' })
    apiMock.listProductStations.mockResolvedValue([
      { id: 'm1', product_id: 'p1', kitchen_station_id: 's1', role: null },
    ])
    const k = useKitchenStore()
    await k.attachProduct('p1', 's1')
    expect(apiMock.attachProductStation).toHaveBeenCalledWith({
      product_id: 'p1',
      kitchen_station_id: 's1',
      role: null,
    })
    expect(k.stationsForProduct('p1')).toHaveLength(1)
  })

  it('attachProduct threads an explicit role through to the API', async () => {
    apiMock.attachProductStation.mockResolvedValue({ id: 'm1' })
    apiMock.listProductStations.mockResolvedValue([
      { id: 'm1', product_id: 'p1', kitchen_station_id: 's1', role: 'Parrilla' },
    ])
    const k = useKitchenStore()
    await k.attachProduct('p1', 's1', 'Parrilla')
    expect(apiMock.attachProductStation).toHaveBeenCalledWith({
      product_id: 'p1',
      kitchen_station_id: 's1',
      role: 'Parrilla',
    })
    expect(k.stationsForProduct('p1')[0]?.role).toBe('Parrilla')
  })

  it('updateMapping patches role/tasks in place and refetches the product mappings', async () => {
    apiMock.updateProductStation.mockResolvedValue({ id: 'm1', tasks: ['Carne'] })
    apiMock.listProductStations.mockResolvedValue([
      { id: 'm1', product_id: 'p1', kitchen_station_id: 's1', role: 'Parrilla', tasks: ['Carne'] },
    ])
    const k = useKitchenStore()
    await k.updateMapping('p1', 'm1', { tasks: ['Carne'] })
    expect(apiMock.updateProductStation).toHaveBeenCalledWith('m1', { tasks: ['Carne'] })
    expect(k.stationsForProduct('p1')[0]?.tasks).toEqual(['Carne'])
  })

  it('exposes allTickets flattened across stations and an order_item→order index', () => {
    const k = useKitchenStore()
    k.itemIndex = {
      i1: { label: 'Pizza', quantity: 1, orderId: 'o1', channel: 'dine_in', tableNumber: '5', variantId: null },
      i2: { label: 'Pasta', quantity: 1, orderId: 'o2', channel: 'takeaway', tableNumber: null, variantId: null },
    }
    k.ticketsByStation = {
      s1: [ticket('t1', 'ready', 'i1')],
      s2: [ticket('t2', 'pending', 'i2')],
    }
    expect(k.allTickets).toHaveLength(2)
    expect(k.itemOrderIndex).toEqual({ i1: 'o1', i2: 'o2' })
  })

  it('groups a station tickets into board columns', () => {
    const k = useKitchenStore()
    k.ticketsByStation = {
      s1: [ticket('t1', 'pending'), ticket('t2', 'in_progress'), ticket('t3', 'ready'), ticket('t4', 'pending')],
    }
    const cols = k.columns('s1')
    expect(cols.pending).toHaveLength(2)
    expect(cols.in_progress).toHaveLength(1)
    expect(cols.ready).toHaveLength(1)
  })

  it('resolves a ticket label, falling back to a short ref', () => {
    const k = useKitchenStore()
    k.itemIndex = {
      i1: { label: 'Pizza · Grande', quantity: 2, orderId: 'o1', channel: 'dine_in', tableNumber: '5', variantId: null },
    }
    expect(k.ticketLabel(ticket('t1', 'pending', 'i1'))).toBe('Pizza · Grande ×2')
    expect(k.ticketLabel(ticket('abcdef1234', 'pending', 'unknown'))).toBe('#abcdef12')
  })

  it('builds the item index with order context from the orders store', async () => {
    ordersMock.orders = [{ id: 'o1', channel: 'dine_in', dining_table_id: 'tb1' }]
    ordersMock.tables = [{ id: 'tb1', number: '5' }]
    ordersMock.itemsByOrder = {
      o1: [
        { id: 'i1', product_variant_id: 'v1', quantity: 3 },
        { id: 'i2', product_variant_id: 'vX', quantity: 1 },
      ],
    }
    const k = useKitchenStore()
    await k.buildItemIndex('b1')
    expect(ordersMock.buildVariantIndex).toHaveBeenCalledWith('b1')
    expect(ordersMock.loadOrders).toHaveBeenCalledWith('b1', 'open')
    expect(ordersMock.loadTables).toHaveBeenCalledWith('b1')
    expect(k.itemIndex['i1']).toEqual({
      label: 'Pizza · Grande',
      quantity: 3,
      orderId: 'o1',
      channel: 'dine_in',
      tableNumber: '5',
      variantId: 'v1',
    })
    // i2 resolves to '—' label → ticketLabel will fall back to a short ref
    expect(k.ticketLabel(ticket('t2', 'pending', 'i2'))).toBe('#t2')
  })

  it('groups a station tickets into per-order dockets', () => {
    const k = useKitchenStore()
    k.itemIndex = {
      i1: { label: 'Pizza · Grande', quantity: 1, orderId: 'o1', channel: 'dine_in', tableNumber: '5', variantId: null },
      i2: { label: 'Pasta', quantity: 2, orderId: 'o1', channel: 'dine_in', tableNumber: '5', variantId: null },
      i3: { label: 'Café', quantity: 1, orderId: 'o2', channel: 'takeaway', tableNumber: null, variantId: null },
    }
    k.ticketsByStation = {
      s1: [ticket('t1', 'pending', 'i1'), ticket('t2', 'pending', 'i2'), ticket('t3', 'ready', 'i3')],
    }
    const dockets = k.orderDockets('s1')
    expect(dockets).toHaveLength(2)
    expect(dockets[0]?.orderId).toBe('o1')
    expect(dockets[0]?.tickets).toHaveLength(2)
    expect(dockets[0]?.tableNumber).toBe('5')
    expect(dockets[1]?.orderId).toBe('o2')
  })

  describe('live events (SSE)', () => {
    interface CapturedSse {
      url: string
      onEvent: (data: unknown) => void
      onStateChange?: (connected: boolean) => void
    }
    const fakeClient = { start: vi.fn<() => void>(), stop: vi.fn<() => void>() }

    function startWithCapture(k: ReturnType<typeof useKitchenStore>): CapturedSse {
      fakeClient.start.mockReset()
      fakeClient.stop.mockReset()
      sseMock.createSseClient.mockReturnValue(fakeClient)
      k.startEvents('b1')
      const calls = sseMock.createSseClient.mock.calls
      return calls[calls.length - 1]?.[0] as CapturedSse
    }

    it('subscribes to the branch stream and starts the client', () => {
      const k = useKitchenStore()
      const opts = startWithCapture(k)
      expect(opts.url).toContain('/kitchen/events?branch_id=b1')
      expect(fakeClient.start).toHaveBeenCalledTimes(1)
      k.stopEvents()
      expect(fakeClient.stop).toHaveBeenCalledTimes(1)
    })

    it('debounces ticket_advanced events into one station-targeted refetch', async () => {
      vi.useFakeTimers()
      try {
        const k = useKitchenStore()
        k.stations = [STATION]
        apiMock.listTickets.mockResolvedValue([])
        const opts = startWithCapture(k)

        opts.onEvent({ type: 'ticket_advanced', station_id: 's1', status: 'ready' })
        opts.onEvent({ type: 'ticket_advanced', station_id: 's1', status: 'ready' })
        expect(apiMock.listTickets).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(400)
        expect(apiMock.listTickets).toHaveBeenCalledTimes(1)
        expect(apiMock.listTickets).toHaveBeenCalledWith('s1')
        k.stopEvents()
      } finally {
        vi.useRealTimers()
      }
    })

    it('a ticket_created event triggers a full board poll (labels may be unknown)', async () => {
      vi.useFakeTimers()
      try {
        const k = useKitchenStore()
        k.stations = [STATION]
        apiMock.listTickets.mockResolvedValue([ticket('t-new', 'pending', 'i-unknown')])
        const opts = startWithCapture(k)

        opts.onEvent({ type: 'ticket_created', station_id: 's1', status: 'pending' })
        await vi.advanceTimersByTimeAsync(400)
        // full board load fans out per station, and the unknown item rebuilds the index
        expect(apiMock.listTickets).toHaveBeenCalledWith('s1')
        expect(ordersMock.loadOrders).toHaveBeenCalledWith('b1', 'open')
        k.stopEvents()
      } finally {
        vi.useRealTimers()
      }
    })

    it('relaxes polling while the stream is healthy and restores it on drop', () => {
      const k = useKitchenStore()
      const spy = vi.spyOn(k, 'startPolling')
      const opts = startWithCapture(k)

      opts.onStateChange?.(true)
      expect(spy).toHaveBeenLastCalledWith('b1', 60_000)
      opts.onStateChange?.(false)
      expect(spy).toHaveBeenLastCalledWith('b1', 10_000)

      // once stopped, a stale client's state changes must not restart polling
      k.stopEvents()
      k.stopPolling()
      spy.mockClear()
      opts.onStateChange?.(false)
      expect(spy).not.toHaveBeenCalled()
    })
  })

  it('counts open (non-ready) tickets per station for the rail', () => {
    const k = useKitchenStore()
    k.ticketsByStation = {
      s1: [ticket('t1', 'pending'), ticket('t2', 'in_progress'), ticket('t3', 'ready')],
    }
    expect(k.openCountOf('s1')).toBe(2)
  })
})
