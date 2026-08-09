import { describe, expect, it } from 'vitest'
import { buildTableVMs, occupancyCounts, openOrderForTable } from '../floorModel'
import type { DiningTable, KitchenState, Order } from '@/services/orders.api'

const table = (id: string, number: string, active = true): DiningTable => ({
  id,
  branch_id: 'b1',
  number,
  code: null,
  capacity: 4,
  status: 'free',
  is_active: active,
})

const order = (
  id: string,
  tableId: string | null,
  total: string,
  status = 'open',
  kitchenState: KitchenState = 'none',
): Order => ({
  payment_method: 'cash',
  items: null,
  id,
  branch_id: 'b1',
  channel: tableId ? 'dine_in' : 'takeaway',
  employee_id: 'e1',
  status,
  subtotal: total,
  discount: '0',
  total,
  dining_table_id: tableId,
  diner_name: null,
  origin: 'staff',
  customer_id: null,
  whatsapp_contact_id: null,
  closed_at: null,
  kitchen_state: kitchenState,
})

describe('openOrderForTable', () => {
  it('finds the open order backing a table', () => {
    const orders = [order('o1', 't1', '10000'), order('o2', 't2', '5000')]
    expect(openOrderForTable(orders, 't1')?.id).toBe('o1')
  })

  it('ignores non-open orders on the table', () => {
    const orders = [order('o1', 't1', '10000', 'closed')]
    expect(openOrderForTable(orders, 't1')).toBeNull()
  })

  it('returns null when no order backs the table', () => {
    expect(openOrderForTable([], 't1')).toBeNull()
  })
})

describe('buildTableVMs', () => {
  it('marks a table occupied with its order total when it has an open order', () => {
    const vms = buildTableVMs([table('t1', '01')], [order('o1', 't1', '32000')])
    expect(vms).toHaveLength(1)
    expect(vms[0]!.isOccupied).toBe(true)
    expect(vms[0]!.total).toBe(32000)
    expect(vms[0]!.openOrder?.id).toBe('o1')
  })

  it('marks a table free with zero total when no open order backs it', () => {
    const vms = buildTableVMs([table('t1', '01')], [])
    expect(vms[0]!.isOccupied).toBe(false)
    expect(vms[0]!.total).toBe(0)
    expect(vms[0]!.openOrder).toBeNull()
  })

  it('excludes inactive tables', () => {
    const vms = buildTableVMs([table('t1', '01', false), table('t2', '02')], [])
    expect(vms.map((v) => v.table.id)).toEqual(['t2'])
  })

  it('sorts tables numerically by number', () => {
    const vms = buildTableVMs([table('t2', '10'), table('t1', '2')], [])
    expect(vms.map((v) => v.table.number)).toEqual(['2', '10'])
  })

  it('does not count a takeaway/delivery order (no table) as occupying any table', () => {
    const vms = buildTableVMs([table('t1', '01')], [order('o1', null, '9000')])
    expect(vms[0]!.isOccupied).toBe(false)
  })

  it('defaults kitchenState to none and progress to null when kitchen data is absent', () => {
    const vms = buildTableVMs([table('t1', '01')], [order('o1', 't1', '10000', 'open')])
    expect(vms[0]!.kitchenState).toBe('none')
    expect(vms[0]!.progress).toBeNull()
  })

  it('threads the order kitchen_state and matching progress into the VM', () => {
    const vms = buildTableVMs(
      [table('t1', '01')],
      [order('o1', 't1', '10000', 'open', 'in_kitchen')],
      { o1: { total: 3, ready: 1, readySinceMs: null } },
    )
    expect(vms[0]!.kitchenState).toBe('in_kitchen')
    expect(vms[0]!.progress).toEqual({ total: 3, ready: 1, readySinceMs: null })
  })

  it('leaves progress null for a free table even if a stray progress entry exists', () => {
    const vms = buildTableVMs([table('t1', '01')], [], { o1: { total: 2, ready: 2, readySinceMs: 5 } })
    expect(vms[0]!.progress).toBeNull()
    expect(vms[0]!.kitchenState).toBe('none')
  })
})

describe('occupancyCounts', () => {
  it('counts free vs occupied', () => {
    const vms = buildTableVMs(
      [table('t1', '01'), table('t2', '02'), table('t3', '03')],
      [order('o1', 't1', '10000')],
    )
    expect(occupancyCounts(vms)).toEqual({ total: 3, free: 2, occupied: 1 })
  })
})


describe('una mesa con varias comandas (pedido por QR)', () => {
  it('suma TODAS, no sólo la primera', () => {
    // El fallo que esto previene: la tarjeta decía la cuenta de un comensal y el cajero
    // cobraba otra cosa.
    const vms = buildTableVMs(
      [table('t1', '5')],
      [
        { ...order('o1', 't1', '32000.00'), diner_name: 'Ana' },
        { ...order('o2', 't1', '54000.00'), diner_name: 'Luis' },
      ],
    )

    expect(vms[0]?.total).toBe(86000)
    expect(vms[0]?.openOrders).toHaveLength(2)
  })

  it('nombra a los comensales que la mesa sostiene', () => {
    const vms = buildTableVMs(
      [table('t1', '5')],
      [
        { ...order('o1', 't1', '32000.00'), diner_name: 'Ana' },
        { ...order('o2', 't1', '54000.00'), diner_name: 'Luis' },
      ],
    )

    expect(vms[0]?.dinerNames).toEqual(['Ana', 'Luis'])
  })

  it('una comanda sin nombre no deja un hueco en la lista', () => {
    // Las que abre un mesero no llevan nombre: no pueden aparecer como comensal vacío.
    const vms = buildTableVMs(
      [table('t1', '5')],
      [
        { ...order('o1', 't1', '10000.00'), diner_name: null },
        { ...order('o2', 't1', '10000.00'), diner_name: 'Ana' },
      ],
    )

    expect(vms[0]?.dinerNames).toEqual(['Ana'])
  })

  it('una mesa libre no suma nada ni nombra a nadie', () => {
    const vms = buildTableVMs([table('t1', '5')], [])

    expect(vms[0]?.isOccupied).toBe(false)
    expect(vms[0]?.total).toBe(0)
    expect(vms[0]?.dinerNames).toEqual([])
  })
})
