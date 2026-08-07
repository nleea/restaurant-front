// La hoja imprimible. Lo que se protege aquí es que nunca se mande a imprimir algo que no
// sirva: sin URL a la vista nadie revisa, y sin dominio configurado el QR llevaría a ninguna
// parte. Las dos cosas cuestan despegar diez calcomanías.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const ordersMock = vi.hoisted(() => ({
  listTables: vi.fn<(...a: unknown[]) => unknown>(),
  getTableQr: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/orders.api', () => ordersMock)

import TableQrSheetView from '../TableQrSheetView.vue'
import { useBranchStore } from '@/stores/branch'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>'

function table(id: string, number: string, is_active = true) {
  return { id, branch_id: 'b1', number, code: `C${number}`, capacity: 4, status: 'free', is_active }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  const branch = useBranchStore()
  branch.branches = [{ id: 'b1', code: 'MAIN', name: 'Centro', is_active: true }] as never
  branch.activeBranchId = 'b1'
  ordersMock.listTables.mockResolvedValue([table('t1', '1'), table('t2', '2')])
  ordersMock.getTableQr.mockImplementation(async (id: unknown) => ({
    url: `https://demo.wsquote.uk/store/MAIN/table/C-${String(id)}`,
    svg: SVG,
  }))
})

async function mountView() {
  const w = mount(TableQrSheetView)
  await flushPromises()
  return w
}

describe('la hoja', () => {
  it('pinta una tarjeta por mesa activa, con su número', async () => {
    const w = await mountView()

    const cards = w.findAll('[data-testid="sticker"]')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('Mesa 1')
    expect(cards[1]?.text()).toContain('Mesa 2')
  })

  it('enseña la URL debajo de cada QR', async () => {
    // Un QR es opaco: sin la URL a la vista, nadie revisa a dónde apunta antes de imprimir.
    const w = await mountView()

    const urls = w.findAll('[data-testid="sticker-url"]')
    expect(urls).toHaveLength(2)
    expect(urls[0]?.text()).toContain('/store/MAIN/table/')
  })

  it('deja fuera las mesas desactivadas', async () => {
    ordersMock.listTables.mockResolvedValue([table('t1', '1'), table('t2', '2', false)])

    const w = await mountView()

    expect(w.findAll('[data-testid="sticker"]')).toHaveLength(1)
    expect(ordersMock.getTableQr).toHaveBeenCalledTimes(1)
  })

  it('ordena las mesas como las cuenta una persona: la 10 después de la 9', async () => {
    ordersMock.listTables.mockResolvedValue([
      table('t10', '10'),
      table('t2', '2'),
      table('t9', '9'),
    ])

    const w = await mountView()

    const numbers = w.findAll('[data-testid="sticker"]').map((c) => c.find('h2').text())
    expect(numbers).toEqual(['Mesa 2', 'Mesa 9', 'Mesa 10'])
  })
})

describe('cuando no se puede imprimir', () => {
  it('sin dominio público lo dice en palabras y no pinta ningún QR', async () => {
    // El backend responde 422 ANTES que dar un QR que lleva a ninguna parte. Aquí hay que
    // decir a quién le toca arreglarlo, no enseñar un código.
    ordersMock.getTableQr.mockRejectedValue({
      response: { data: { detail: 'No hay dominio público configurado (STOREFRONT_BASE_URL): …' } },
    })

    const w = await mountView()

    expect(w.get('[data-testid="problem"]').text()).toContain('STOREFRONT_BASE_URL')
    expect(w.findAll('[data-testid="sticker"]')).toHaveLength(0)
  })

  it('sin mesas dice qué hacer, en vez de una hoja en blanco', async () => {
    ordersMock.listTables.mockResolvedValue([])

    const w = await mountView()

    expect(w.get('[data-testid="problem"]').text()).toContain('no tiene mesas activas')
  })

  it('no deja imprimir cuando no hay nada que imprimir', async () => {
    ordersMock.listTables.mockResolvedValue([])

    const w = await mountView()

    expect((w.get('[data-testid="print"]').element as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('la sede', () => {
  it('cambiar de sucursal regenera la hoja entera', async () => {
    // La sede va DENTRO de la URL de cada QR: una hoja de otra sucursal manda la comida a la
    // cocina equivocada.
    const w = await mountView()
    expect(ordersMock.listTables).toHaveBeenCalledTimes(1)

    useBranchStore().activeBranchId = 'b2'
    await flushPromises()

    expect(ordersMock.listTables).toHaveBeenCalledTimes(2)
    expect(ordersMock.listTables).toHaveBeenLastCalledWith('b2')
    expect(w.findAll('[data-testid="sticker"]')).toHaveLength(2)
  })
})
