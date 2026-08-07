import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  getMyEmployee: vi.fn<(...a: unknown[]) => unknown>(),
  listTables: vi.fn<(...a: unknown[]) => unknown>(),
  createTable: vi.fn<(...a: unknown[]) => unknown>(),
  openOrder: vi.fn<(...a: unknown[]) => unknown>(),
  listOrders: vi.fn<(...a: unknown[]) => unknown>(),
  getOrder: vi.fn<(...a: unknown[]) => unknown>(),
  setDiscount: vi.fn<(...a: unknown[]) => unknown>(),
  closeOrder: vi.fn<(...a: unknown[]) => unknown>(),
  cancelOrder: vi.fn<(...a: unknown[]) => unknown>(),
  listItems: vi.fn<(...a: unknown[]) => unknown>(),
  addItem: vi.fn<(...a: unknown[]) => unknown>(),
  setItemNotes: vi.fn<(...a: unknown[]) => unknown>(),
  updateItemQuantity: vi.fn<(...a: unknown[]) => unknown>(),
  removeItem: vi.fn<(...a: unknown[]) => unknown>(),
  registerPayment: vi.fn<(...a: unknown[]) => unknown>(),
  listPayments: vi.fn<(...a: unknown[]) => unknown>(),
  verifyPayment: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/orders.api', () => apiMock)

import { useOrdersStore } from '../orders'

const EMP = { id: 'e1', branch_id: 'b1', role_id: 'r1', is_active: true }
const ORDER = {
  id: 'o1',
  branch_id: 'b1',
  channel: 'dine_in',
  employee_id: 'e1',
  status: 'open',
  subtotal: '0.00',
  discount: '0.00',
  total: '0.00',
  dining_table_id: 't1',
  diner_name: null,
  origin: 'staff',
  customer_id: null,
  whatsapp_contact_id: null,
  closed_at: null,
  kitchen_state: 'none' as const,
  // Efectivo: no necesita verificación. Estos tests son del ciclo de la comanda,
  // no del gate de pago prepagado (que tiene el suyo).
  payment_method: 'cash' as string | null,
}
const ITEM = {
  id: 'i1',
  order_id: 'o1',
  product_variant_id: 'v1',
  quantity: 2,
  unit_price: '15000.00',
  line_subtotal: '30000.00',
  status: 'pending',
  notes: null,
  sent: false,
}

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('orders store', () => {
  it('resolves the current employee', async () => {
    apiMock.getMyEmployee.mockResolvedValue(EMP)
    const orders = useOrdersStore()
    await orders.resolveEmployee()
    expect(orders.hasEmployee).toBe(true)
    expect(orders.currentEmployee?.id).toBe('e1')
  })

  it('handles a non-employee user (404) without throwing', async () => {
    apiMock.getMyEmployee.mockRejectedValue({ response: { status: 404 } })
    const orders = useOrdersStore()
    await orders.resolveEmployee()
    expect(orders.employeeResolved).toBe(true)
    expect(orders.hasEmployee).toBe(false)
  })

  it('openOrder requires a resolved employee', async () => {
    const orders = useOrdersStore()
    await expect(orders.openOrder('b1', 'takeaway', null)).rejects.toThrow(/empleado/)
    expect(apiMock.openOrder).not.toHaveBeenCalled()
  })

  it('openOrder sends the resolved employee and refetches', async () => {
    orderStoreWithEmployee()
    apiMock.openOrder.mockResolvedValue(ORDER)
    apiMock.listOrders.mockResolvedValue([ORDER])
    apiMock.listTables.mockResolvedValue([])
    apiMock.listItems.mockResolvedValue([])
    const orders = useOrdersStore()
    orders.currentEmployee = EMP
    await orders.openOrder('b1', 'dine_in', 't1')
    expect(apiMock.openOrder).toHaveBeenCalledWith({
      branch_id: 'b1',
      channel: 'dine_in',
      employee_id: 'e1',
      dining_table_id: 't1',
    })
    expect(apiMock.listOrders).toHaveBeenCalled()
  })

  it('addItem computes unit_price from the variant index and refetches', async () => {
    apiMock.addItem.mockResolvedValue(ITEM)
    apiMock.getOrder.mockResolvedValue({ ...ORDER, subtotal: '30000.00', total: '30000.00' })
    apiMock.listItems.mockResolvedValue([ITEM])
    const orders = useOrdersStore()
    orders.orders = [ORDER]
    orders.variantIndex = { v1: { productName: 'Burger', variantName: 'Estándar', unitPrice: 15000 } }

    await orders.addItem('o1', 'v1', 2)

    // A tile tap carries no note — the kitchen note is written later, on the dupe.
    expect(apiMock.addItem).toHaveBeenCalledWith('o1', {
      product_variant_id: 'v1',
      quantity: 2,
      unit_price: '15000.00',
    })
    // Server totals are shown verbatim after refetch.
    expect(orders.orders[0]?.total).toBe('30000.00')
    expect(orders.itemsOf('o1')).toHaveLength(1)
  })

  it('setItemNotes trims the note and refetches the order', async () => {
    apiMock.setItemNotes.mockResolvedValue(ITEM)
    apiMock.getOrder.mockResolvedValue(ORDER)
    apiMock.listItems.mockResolvedValue([ITEM])
    const orders = useOrdersStore()
    orders.orders = [ORDER]

    await orders.setItemNotes('o1', 'i1', '  sin cebolla  ')

    expect(apiMock.setItemNotes).toHaveBeenCalledWith('i1', 'sin cebolla')
    expect(apiMock.getOrder).toHaveBeenCalledWith('o1')
  })

  it('setItemNotes sends null when the waiter empties the field', async () => {
    apiMock.setItemNotes.mockResolvedValue(ITEM)
    apiMock.getOrder.mockResolvedValue(ORDER)
    apiMock.listItems.mockResolvedValue([ITEM])
    const orders = useOrdersStore()
    orders.orders = [ORDER]

    await orders.setItemNotes('o1', 'i1', '   ')

    expect(apiMock.setItemNotes).toHaveBeenCalledWith('i1', null)
  })

  it('labels items from the variant index, never raw UUIDs', () => {
    const orders = useOrdersStore()
    orders.variantIndex = {
      v1: { productName: 'Burger', variantName: 'Estándar', unitPrice: 15000 },
      v2: { productName: 'Pizza', variantName: 'Grande', unitPrice: 28000 },
    }
    expect(orders.itemLabel(ITEM)).toBe('Burger')
    expect(orders.itemLabel({ ...ITEM, product_variant_id: 'v2' })).toBe('Pizza · Grande')
  })

  it('setDiscount writes through then refetches the order', async () => {
    apiMock.setDiscount.mockResolvedValue(ORDER)
    apiMock.getOrder.mockResolvedValue({ ...ORDER, discount: '1000.00', total: '29000.00' })
    apiMock.listItems.mockResolvedValue([ITEM])
    const orders = useOrdersStore()
    orders.orders = [ORDER]
    await orders.setDiscount('o1', '1000')
    expect(apiMock.setDiscount).toHaveBeenCalledWith('o1', '1000')
    expect(orders.orders[0]?.total).toBe('29000.00')
  })

  it('cancelOrder sends the employee and reason', async () => {
    apiMock.cancelOrder.mockResolvedValue({ ...ORDER, status: 'cancelled' })
    apiMock.listOrders.mockResolvedValue([])
    apiMock.listTables.mockResolvedValue([])
    const orders = useOrdersStore()
    orders.currentEmployee = EMP
    await orders.cancelOrder('b1', 'o1', 'cliente se fue')
    expect(apiMock.cancelOrder).toHaveBeenCalledWith('o1', {
      reason: 'cliente se fue',
      requested_by_employee_id: 'e1',
    })
  })

  it('derives paid and balance from the payments list', async () => {
    const orders = useOrdersStore()
    orders.orders = [{ ...ORDER, total: '50000.00' }]
    orders.paymentsByOrder = {
      o1: [{ id: 'p1', order_id: 'o1', branch_id: 'b1', cash_session_id: 'cs1', amount: '20000.00', method: 'cash', employee_id: 'e1', diner_reference: null }],
    }
    expect(orders.paidOf('o1')).toBe(20000)
    expect(orders.balanceOf('o1')).toBe(30000)
  })

  it('clamps the balance to zero when fully settled (overpayment)', async () => {
    const orders = useOrdersStore()
    orders.orders = [{ ...ORDER, total: '50000.00' }]
    orders.paymentsByOrder = {
      o1: [{ id: 'p1', order_id: 'o1', branch_id: 'b1', cash_session_id: 'cs1', amount: '60000.00', method: 'cash', employee_id: 'e1', diner_reference: null }],
    }
    expect(orders.balanceOf('o1')).toBe(0)
  })

  it('registerPayment injects the employee then write-through refetches payments + order', async () => {
    apiMock.registerPayment.mockResolvedValue({})
    apiMock.listPayments.mockResolvedValue([
      { id: 'p1', order_id: 'o1', branch_id: 'b1', cash_session_id: 'cs1', amount: '50000.00', method: 'nequi', employee_id: 'e1', diner_reference: null },
    ])
    apiMock.getOrder.mockResolvedValue({ ...ORDER, total: '50000.00' })
    apiMock.listItems.mockResolvedValue([ITEM])
    const orders = useOrdersStore()
    orders.currentEmployee = EMP
    orders.orders = [{ ...ORDER, total: '50000.00' }]
    await orders.registerPayment('o1', { amount: '50000.00', method: 'nequi' })
    expect(apiMock.registerPayment).toHaveBeenCalledWith('o1', {
      amount: '50000.00',
      method: 'nequi',
      employee_id: 'e1',
    })
    expect(orders.paymentsOf('o1')).toHaveLength(1)
    expect(orders.balanceOf('o1')).toBe(0)
  })

  it('registerPayment requires a linked employee', async () => {
    const orders = useOrdersStore()
    orders.currentEmployee = null
    await expect(
      orders.registerPayment('o1', { amount: '1000', method: 'cash' }),
    ).rejects.toThrow('empleado')
    expect(apiMock.registerPayment).not.toHaveBeenCalled()
  })

  it('registerPayment propagates a 409 (no open cash session)', async () => {
    apiMock.registerPayment.mockRejectedValue({ response: { status: 409 } })
    const orders = useOrdersStore()
    orders.currentEmployee = EMP
    orders.orders = [ORDER]
    await expect(
      orders.registerPayment('o1', { amount: '1000', method: 'cash' }),
    ).rejects.toMatchObject({ response: { status: 409 } })
  })
})

// Helper kept tiny: marks intent that the store needs an employee for the next op.
function orderStoreWithEmployee(): void {
  apiMock.getMyEmployee.mockResolvedValue(EMP)
}

describe('payment verification', () => {
  it('a prepaid order with no payments needs verification', () => {
    const store = useOrdersStore()
    store.orders = [{ ...ORDER, total: '25000.00', payment_method: 'transfer' }]
    store.paymentsByOrder = { o1: [] }

    expect(store.needsPaymentVerification('o1')).toBe(true)
  })

  it('a cash order never needs it — its money arrives at the door', () => {
    const store = useOrdersStore()
    store.orders = [{ ...ORDER, total: '25000.00', payment_method: 'cash' }]
    store.paymentsByOrder = { o1: [] }

    expect(store.needsPaymentVerification('o1')).toBe(false)
  })

  it('a covered prepaid order stops needing it', () => {
    const store = useOrdersStore()
    store.orders = [{ ...ORDER, total: '25000.00', payment_method: 'transfer' }]
    store.paymentsByOrder = {
      o1: [
        {
          id: 'p1',
          order_id: 'o1',
          branch_id: 'b1',
          cash_session_id: 'c1',
          amount: '25000.00',
          method: 'transfer',
          employee_id: 'e1',
          diner_reference: null,
        },
      ],
    }

    expect(store.needsPaymentVerification('o1')).toBe(false)
  })

  it('verifying pays and fires in one call, then refreshes the order', async () => {
    const store = useOrdersStore()
    store.orders = [{ ...ORDER, payment_method: 'transfer' }]
    apiMock.verifyPayment.mockResolvedValue({ ...ORDER, payment_method: 'transfer' })
    apiMock.getOrder.mockResolvedValue({ ...ORDER, payment_method: 'transfer' })
    apiMock.listItems.mockResolvedValue([])
    apiMock.listPayments.mockResolvedValue([])

    await store.verifyPayment('o1', 'e1')

    expect(apiMock.verifyPayment).toHaveBeenCalledWith('o1', 'e1')
  })

  it('verificar relee los PAGOS, no sólo el pedido', async () => {
    // El bug que esto fija: verificar registra el pago en el servidor, pero la pantalla seguía
    // calculando "saldada" con los pagos viejos (ninguno). La comanda no ofrecía cerrarse hasta
    // que alguien salía y volvía a entrar — con el pedido ya pagado y en cocina.
    const store = useOrdersStore()
    store.orders = [{ ...ORDER, payment_method: 'transfer', total: '46000.00' }]
    store.paymentsByOrder = { o1: [] }
    apiMock.verifyPayment.mockResolvedValue({ ...ORDER, payment_method: 'transfer' })
    apiMock.getOrder.mockResolvedValue({
      ...ORDER,
      payment_method: 'transfer',
      total: '46000.00',
    })
    apiMock.listItems.mockResolvedValue([])
    apiMock.listPayments.mockResolvedValue([
      { id: 'p1', order_id: 'o1', amount: '46000.00', method: 'transfer' },
    ])

    await store.verifyPayment('o1', 'e1')

    expect(apiMock.listPayments).toHaveBeenCalledWith('o1')
    expect(store.paidOf('o1')).toBe(46000)
    expect(store.balanceOf('o1')).toBe(0)
    // Y por lo tanto ya no hace falta verificar nada: la comanda puede cerrarse.
    expect(store.needsPaymentVerification('o1')).toBe(false)
  })
})

describe('a settled delivery leaves the pending-collection list', () => {
  it('the salón only ever loads open orders, so a closed one drops out', async () => {
    const store = useOrdersStore()
    apiMock.listOrders.mockResolvedValue([ORDER])
    await store.loadOrders('b1')

    // Sin filtro explícito, la lista es de abiertas. Cuando la entrega cierra la comanda
    // (backend), deja de venir — sin que Salón tenga que hacer nada.
    expect(apiMock.listOrders).toHaveBeenCalledWith({ branchId: 'b1', status: 'open' })

    apiMock.listOrders.mockResolvedValue([])
    await store.loadOrders('b1')
    expect(store.orders).toEqual([])
  })
})
