// Cobrar una mesa. Lo que se protege: que junto sea el defecto, que separar sea la misma
// pantalla con menos marcados, y que el cajero vea siempre cuánto falta mientras cuenta billetes.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const ordersMock = vi.hoisted(() => ({
  listTables: vi.fn<(...a: unknown[]) => unknown>(),
  listOrders: vi.fn<(...a: unknown[]) => unknown>(),
  openTableBill: vi.fn<(...a: unknown[]) => unknown>(),
  dissolveTableBill: vi.fn<(...a: unknown[]) => unknown>(),
  chargeTableBill: vi.fn<(...a: unknown[]) => unknown>(),
  getBillReceipt: vi.fn<(...a: unknown[]) => unknown>(),
  recordBillReceipt: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/orders.api', () => ordersMock)

import TableSettlementView from '../TableSettlementView.vue'
import { useBranchStore } from '@/stores/branch'
import { useCashStore } from '@/stores/cash'

const TABLE = { id: 't1', branch_id: 'b1', number: '5', code: 'M5', capacity: 4, status: 'occupied', is_active: true }

function order(id: string, total: string) {
  return { id, branch_id: 'b1', dining_table_id: 't1', total, status: 'open' }
}

const BILL = {
  id: 'bill1',
  branch_id: 'b1',
  dining_table_id: 't1',
  status: 'open' as const,
  total: '0.00',
  outstanding: '86000.00',
  closed_at: null,
  members: [
    { order_id: 'o1', order_label: 'AAAA1111', diner_name: 'Ana', total: '32000.00', paid: '0.00', outstanding: '32000.00' },
    { order_id: 'o2', order_label: 'BBBB2222', diner_name: 'Luis', total: '54000.00', paid: '0.00', outstanding: '54000.00' },
  ],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  const branch = useBranchStore()
  branch.branches = [{ id: 'b1', code: 'MAIN', name: 'Centro', is_active: true }] as never
  branch.activeBranchId = 'b1'
  const cash = useCashStore()
  cash.currentSession = { id: 's1', opened_by_employee_id: 'e1' } as never

  ordersMock.listTables.mockResolvedValue([TABLE])
  ordersMock.listOrders.mockResolvedValue([order('o1', '32000.00'), order('o2', '54000.00')])
  ordersMock.openTableBill.mockResolvedValue(BILL)
  ordersMock.dissolveTableBill.mockResolvedValue(undefined)
  ordersMock.chargeTableBill.mockResolvedValue({ ...BILL, status: 'settled', outstanding: '0.00' })
  ordersMock.getBillReceipt.mockResolvedValue({
    bill_id: 'bill1',
    business_name: 'Demo',
    tax_id: '900123',
    business_address: null,
    branch_name: 'Centro',
    table_number: '5',
    total: '86000.00',
    methods: ['cash'],
    members: [],
    closed_at: null,
    is_fiscal_invoice: false,
  })
  ordersMock.recordBillReceipt.mockResolvedValue({ is_reprint: false })
})

async function mountView() {
  const w = mount(TableSettlementView)
  await flushPromises()
  return w
}

async function openTable(w: Awaited<ReturnType<typeof mountView>>) {
  await w.get('[data-testid="table-row"]').trigger('click')
  await flushPromises()
  return w
}

describe('elegir mesa', () => {
  it('lista sólo mesas con comandas abiertas, con su suma', async () => {
    const w = await mountView()

    const rows = w.findAll('[data-testid="table-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('Mesa 5')
    expect(rows[0]?.text()).toContain('2 comandas')
  })

  it('sin mesas abiertas lo dice, en vez de una lista vacía', async () => {
    ordersMock.listOrders.mockResolvedValue([])

    const w = await mountView()

    expect(w.get('[data-testid="no-tables"]').text()).toContain('No hay mesas')
  })

  it('sin caja abierta no deja cobrar y explica por qué', async () => {
    useCashStore().currentSession = null

    const w = await mountView()
    await w.get('[data-testid="table-row"]').trigger('click')
    await flushPromises()

    expect(w.get('[data-testid="problem"]').text()).toContain('Abre la caja')
    expect(ordersMock.openTableBill).not.toHaveBeenCalled()
  })
})

describe('junto y separado', () => {
  it('abrir una mesa preselecciona TODAS sus comandas', async () => {
    const w = await openTable(await mountView())

    expect(w.findAll('[data-testid="member"]')).toHaveLength(2)
    const checks = w.findAll('input[type="checkbox"]')
    expect(checks.every((c) => (c.element as HTMLInputElement).checked)).toBe(true)
    expect(w.get('[data-testid="selected-total"]').text()).toContain('86.000')
  })

  it('quitar a alguien recalcula el total', async () => {
    const w = await openTable(await mountView())

    await w.get('[data-testid="member-check-BBBB2222"]').trigger('change')

    expect(w.get('[data-testid="selected-total"]').text()).toContain('32.000')
  })

  it('con nadie marcado no se puede cobrar', async () => {
    const w = await openTable(await mountView())

    await w.get('[data-testid="member-check-AAAA1111"]').trigger('change')
    await w.get('[data-testid="member-check-BBBB2222"]').trigger('change')

    expect((w.get('[data-testid="charge"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('cobrar a una selección parcial reabre la cuenta con sólo esos miembros', async () => {
    // Cobrar sobre una cuenta que incluye a quien el cajero excluyó cobraría de más.
    const w = await openTable(await mountView())
    await w.get('[data-testid="member-check-BBBB2222"]').trigger('change')
    await w.get('[data-testid="amount"]').setValue('32000')
    await w.get('[data-testid="add-payment"]').trigger('click')

    await w.get('[data-testid="charge"]').trigger('click')
    await flushPromises()

    expect(ordersMock.dissolveTableBill).toHaveBeenCalledWith('bill1')
    expect(ordersMock.openTableBill).toHaveBeenLastCalledWith({
      dining_table_id: 't1',
      employee_id: 'e1',
      order_ids: ['o1'],
    })
  })
})

describe('el cobro', () => {
  it('el restante está siempre a la vista y baja con cada pago', async () => {
    const w = await openTable(await mountView())
    expect(w.get('[data-testid="remaining"]').text()).toContain('86.000')

    await w.get('[data-testid="amount"]').setValue('40000')
    await w.get('[data-testid="add-payment"]').trigger('click')

    expect(w.get('[data-testid="remaining"]').text()).toContain('46.000')
  })

  it('acepta varios métodos', async () => {
    const w = await openTable(await mountView())

    await w.get('[data-testid="method"]').setValue('card')
    await w.get('[data-testid="amount"]').setValue('40000')
    await w.get('[data-testid="add-payment"]').trigger('click')
    await w.get('[data-testid="method"]').setValue('cash')
    await w.get('[data-testid="amount"]').setValue('46000')
    await w.get('[data-testid="add-payment"]').trigger('click')

    expect(w.findAll('[data-testid="payment-entry"]')).toHaveLength(2)
    await w.get('[data-testid="charge"]').trigger('click')
    await flushPromises()
    expect(ordersMock.chargeTableBill).toHaveBeenCalledWith(
      'bill1',
      [
        { amount: '40000', method: 'card' },
        { amount: '46000', method: 'cash' },
      ],
      'e1',
    )
  })

  it('al liquidar dice qué comandas se cerraron', async () => {
    const w = await openTable(await mountView())
    await w.get('[data-testid="amount"]').setValue('86000')
    await w.get('[data-testid="add-payment"]').trigger('click')

    await w.get('[data-testid="charge"]').trigger('click')
    await flushPromises()

    expect(w.get('[data-testid="settled"]').text()).toContain('2 comandas')
    expect(w.get('[data-testid="settled"]').text()).toContain('AAAA1111')
  })

  it('un cobro parcial no dice que se cerró nada', async () => {
    ordersMock.chargeTableBill.mockResolvedValue({ ...BILL, outstanding: '46000.00' })
    const w = await openTable(await mountView())
    await w.get('[data-testid="amount"]').setValue('40000')
    await w.get('[data-testid="add-payment"]').trigger('click')

    await w.get('[data-testid="charge"]').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="settled"]').exists()).toBe(false)
  })
})

describe('el fiado', () => {
  it('se explica antes de que el cajero reciba dinero, no como error después', async () => {
    const w = await openTable(await mountView())

    expect(w.get('[data-testid="credit-note"]').text()).toContain('quítalo de la')
  })
})
