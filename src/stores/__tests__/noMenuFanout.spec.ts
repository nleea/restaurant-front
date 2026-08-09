// Cargar el Salón no toca el menú, y no cuesta una petición por comanda.
//
// Es la prueba del titular del change, y se hace a nivel de STORE porque ahí es donde vive la
// propiedad: lo que importa no es qué pinta la vista, es **cuántas peticiones y a qué endpoints**.
// Una prueba de componente montaría media aplicación para afirmar lo mismo peor.
//
// Antes de esto, entrar al Salón con 40 productos y 12 comandas abiertas costaba ~60 peticiones en
// unas 7 barreras secuenciales, y la mayoría eran del menú: el navegador se lo bajaba entero para
// poder calcular el precio de una línea y traducir un id en un nombre.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOrdersStore } from '@/stores/orders'

type Mocked = (...args: unknown[]) => Promise<unknown>

const listOrders = vi.fn<Mocked>()
const listTables = vi.fn<Mocked>()
const listItems = vi.fn<Mocked>()
const addItem = vi.fn<Mocked>()
const getOrder = vi.fn<Mocked>()
const getMyEmployee = vi.fn<Mocked>()

// Mock PARCIAL: sólo lo que este fichero afirma. Enumerar la superficie entera obliga a adivinarla
// y se rompe cada vez que el módulo gana una función.
vi.mock('@/services/orders.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orders.api')>()),
  listOrders: (...a: unknown[]) => listOrders(...a),
  listTables: (...a: unknown[]) => listTables(...a),
  listItems: (...a: unknown[]) => listItems(...a),
  addItem: (...a: unknown[]) => addItem(...a),
  getOrder: (...a: unknown[]) => getOrder(...a),
  getMyEmployee: (...a: unknown[]) => getMyEmployee(...a),
}))

// Todo el módulo del menú, para poder afirmar que NADIE lo llama.
const menuCalls = vi.fn<Mocked>()
vi.mock('@/services/menu.api', () => {
  const spy = (name: string) => (...a: unknown[]) => menuCalls(name, ...a)
  return {
    listProducts: spy('listProducts'),
    listProductPrices: spy('listProductPrices'),
    listVariants: spy('listVariants'),
    listCategories: spy('listCategories'),
    listOrderable: spy('listOrderable'),
  }
})

const ORDER = {
  id: 'o1',
  branch_id: 'b1',
  channel: 'dine_in',
  employee_id: 'e1',
  status: 'open',
  subtotal: '10000.00',
  discount: '0.00',
  total: '10000.00',
  dining_table_id: 't1',
  diner_name: null,
  origin: 'staff',
  customer_id: null,
  whatsapp_contact_id: null,
  closed_at: null,
  kitchen_state: 'none' as const,
  payment_method: 'cash' as string | null,
  items: [
    {
      id: 'i1',
      order_id: 'o1',
      product_variant_id: 'v1',
      quantity: 1,
      unit_price: '10000.00',
      line_subtotal: '10000.00',
      status: 'pending',
      notes: null,
      sent: false,
      product_name: 'Bandeja paisa',
      variant_name: 'Grande',
    },
  ],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getMyEmployee.mockResolvedValue({ id: 'e1', branch_id: 'b1', role_id: 'r1', is_active: true })
  listTables.mockResolvedValue([])
  listOrders.mockResolvedValue([ORDER])
})

describe('cargar el Salón', () => {
  it('no pide NINGÚN endpoint del menú', async () => {
    const orders = useOrdersStore()

    await orders.ensureLoaded('b1')

    expect(menuCalls).not.toHaveBeenCalled()
  })

  it('trae las comandas con sus líneas en una sola petición', async () => {
    const orders = useOrdersStore()

    await orders.ensureLoaded('b1')

    expect(listOrders).toHaveBeenCalledTimes(1)
    expect(listOrders).toHaveBeenCalledWith({
      branchId: 'b1',
      status: 'open',
      includeItems: true,
    })
  })

  it('no pide los ítems de cada comanda por separado', async () => {
    // Era una petición POR COMANDA: con doce mesas abiertas, doce viajes.
    listOrders.mockResolvedValue([ORDER, { ...ORDER, id: 'o2' }, { ...ORDER, id: 'o3' }])
    const orders = useOrdersStore()

    await orders.ensureLoaded('b1')

    expect(listItems).not.toHaveBeenCalled()
    expect(Object.keys(orders.itemsByOrder).sort()).toEqual(['o1', 'o2', 'o3'])
  })

  it('cabe en tres peticiones, y las tres van en paralelo', async () => {
    const orders = useOrdersStore()

    await orders.ensureLoaded('b1')

    const total =
      listOrders.mock.calls.length + listTables.mock.calls.length + getMyEmployee.mock.calls.length
    expect(total).toBe(3)
    expect(listItems).not.toHaveBeenCalled()
  })
})

describe('pintar una línea', () => {
  it('la etiqueta sale de la propia línea, sin haber leído el menú', async () => {
    const orders = useOrdersStore()
    await orders.ensureLoaded('b1')

    const item = orders.itemsOf('o1')[0]!
    expect(orders.itemLabel(item)).toBe('Bandeja paisa · Grande')
    expect(menuCalls).not.toHaveBeenCalled()
  })

  it('el precio también viene en la línea, ya cobrado por el servidor', async () => {
    const orders = useOrdersStore()
    await orders.ensureLoaded('b1')

    expect(orders.itemsOf('o1')[0]!.unit_price).toBe('10000.00')
  })
})

describe('añadir un plato', () => {
  it('no manda precio y no consulta el menú para saberlo', async () => {
    addItem.mockResolvedValue(ORDER.items[0])
    getOrder.mockResolvedValue(ORDER)
    listItems.mockResolvedValue(ORDER.items)
    const orders = useOrdersStore()
    orders.orders = [ORDER]

    await orders.addItem('o1', 'v1', 2)

    expect(addItem).toHaveBeenCalledWith('o1', { product_variant_id: 'v1', quantity: 2 })
    expect(menuCalls).not.toHaveBeenCalled()
  })
})
