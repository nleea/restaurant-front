// La pantalla del comensal: la mesa siempre dicha y nunca elegible, el nombre antes del
// carrito, y confirmar como frontera entre lo que se puede cambiar y lo que ya se está
// cocinando. Lo que se protege aquí es que ninguna de esas cuatro cosas se relaje después.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const storefrontMock = vi.hoisted(() => ({
  getAppearance: vi.fn<(...a: unknown[]) => unknown>(),
  getMenu: vi.fn<(...a: unknown[]) => unknown>(),
  resolveTable: vi.fn<(...a: unknown[]) => unknown>(),
  createTableOrder: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/storefront.api', () => storefrontMock)

const myOrderMock = vi.hoisted(() => ({
  getMyOrder: vi.fn<(...a: unknown[]) => unknown>(),
  editMyOrder: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/myOrder.api', () => myOrderMock)

const guestMock = vi.hoisted(() => ({
  getGuestProfile: vi.fn<(...a: unknown[]) => unknown>(),
  saveGuestProfile: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/guestProfile.api', () => guestMock)

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { branchCode: 'centro', tableCode: 'M5CODE' }, query: {} }),
  useRouter: () => ({ push: vi.fn<(...a: unknown[]) => unknown>() }),
}))

import TableOrderView from '../TableOrderView.vue'
import CartBar from '@/components/storefront/CartBar.vue'
import { useCartStore } from '@/stores/cart'

const TABLE = {
  id: 't1',
  number: '5',
  branchId: 'b1',
  branchName: 'Centro',
  canOrderNow: true,
}

const PRODUCT = {
  id: 'p1',
  categoryId: 'c1',
  name: 'Hamburguesa',
  description: '',
  price: 28000,
  imageUrl: '',
  variantId: 'v1',
  removableIngredients: [],
  addonIds: [],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
  storefrontMock.getAppearance.mockRejectedValue(new Error('sin config'))
  storefrontMock.getMenu.mockResolvedValue({
    categories: [{ id: 'c1', name: 'Platos' }],
    products: [PRODUCT],
    addons: [],
  })
  storefrontMock.resolveTable.mockResolvedValue(TABLE)
  storefrontMock.createTableOrder.mockResolvedValue({
    orderId: 'o1',
    orderNumber: 'A1B2C3D4',
    status: 'open',
    editToken: 'tok-123',
  })
  myOrderMock.getMyOrder.mockResolvedValue(null)
  guestMock.getGuestProfile.mockResolvedValue({ name: null, phone: null, address: null })
})

async function mountView() {
  const wrapper = mount(TableOrderView)
  await flushPromises()
  return wrapper
}

/** Deja el carrito con una línea y salta al paso de revisión, sin pasar por la hoja de producto. */
function seedCart() {
  const cart = useCartStore()
  cart.addItem({
    productId: 'p1',
    variantId: 'v1',
    name: 'Hamburguesa',
    unitPrice: 28000,
    quantity: 1,
    addons: [],
    removed: [],
    note: '',
  })
}

describe('la mesa', () => {
  it('se ve siempre y no se puede cambiar', async () => {
    const w = await mountView()

    expect(w.get('[data-testid="table-badge"]').text()).toContain('Mesa 5')
    // No hay selector de mesa: la mesa es el dato que el QR existe para llevar, y un control
    // para cambiarla reabriría justo el fallo que la ruta previene.
    expect(w.find('select').exists()).toBe(false)
    expect(w.findAll('input')).toHaveLength(1) // sólo el nombre
  })

  it('un código que no resuelve es un callejón sin salida, no una carta vacía', async () => {
    storefrontMock.resolveTable.mockRejectedValue(new Error('404'))

    const w = await mountView()

    expect(w.text()).toContain('No encontramos esa mesa')
    expect(w.find('[data-testid="table-badge"]').exists()).toBe(false)
    expect(w.find('[data-testid="diner-name"]').exists()).toBe(false)
  })
})

describe('el nombre', () => {
  it('se pide antes del carrito y no deja seguir vacío', async () => {
    const w = await mountView()

    w.get('[data-testid="diner-name"]')
    expect(
      (w.get('[data-testid="start-ordering"]').element as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('viene precargado del perfil de invitado y se puede corregir', async () => {
    // Ana le pasa el teléfono a Luis: la precarga ayuda, pero no puede mandar.
    guestMock.getGuestProfile.mockResolvedValue({ name: 'Ana', phone: '3001', address: '' })

    const w = await mountView()

    const input = w.get('[data-testid="diner-name"]').element as HTMLInputElement
    expect(input.value).toBe('Ana')
    await w.get('[data-testid="diner-name"]').setValue('Luis')
    expect(
      (w.get('[data-testid="start-ordering"]').element as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('no pide teléfono ni cuenta', async () => {
    const w = await mountView()

    expect(w.text()).not.toContain('Teléfono')
    expect(w.text()).not.toContain('Iniciar sesión')
  })
})

describe('confirmar', () => {
  it('no se puede con el carrito vacío', async () => {
    const w = await mountView()
    await w.get('[data-testid="diner-name"]').setValue('Ana')
    await w.get('[data-testid="start-ordering"]').trigger('click')

    // Sin líneas no hay barra de carrito, así que no hay forma de llegar a confirmar.
    expect(w.find('[data-testid="confirm"]').exists()).toBe(false)
  })

  it('manda el nombre y las líneas, y guarda el enlace del pedido', async () => {
    const w = await mountView()
    await w.get('[data-testid="diner-name"]').setValue('Ana')
    await w.get('[data-testid="start-ordering"]').trigger('click')
    seedCart()
    await w.vm.$nextTick()
    // La barra del carrito es el único camino del menú a la revisión: confirmar no puede
    // alcanzarse por accidente desde la carta.
    w.findComponent(CartBar).vm.$emit('open')
    await w.vm.$nextTick()
    await w.get('[data-testid="confirm"]').trigger('click')
    await flushPromises()

    expect(storefrontMock.createTableOrder).toHaveBeenCalledWith('centro', 'M5CODE', {
      dinerName: 'Ana',
      lines: [
        {
          variantId: 'v1',
          quantity: 1,
          addonIds: [],
          removedIngredients: [],
          note: '',
        },
      ],
    })
    expect(localStorage.getItem('table-order:centro:M5CODE')).toBe('tok-123')
  })

  it('la caja cerrada se dice con palabras, no con un código', async () => {
    storefrontMock.createTableOrder.mockRejectedValue({
      response: { data: { code: 'cash_closed' } },
    })
    const w = await mountView()
    await w.get('[data-testid="diner-name"]').setValue('Ana')
    await w.get('[data-testid="start-ordering"]').trigger('click')
    seedCart()
    await w.vm.$nextTick()
    // La barra del carrito es el único camino del menú a la revisión: confirmar no puede
    // alcanzarse por accidente desde la carta.
    w.findComponent(CartBar).vm.$emit('open')
    await w.vm.$nextTick()
    await w.get('[data-testid="confirm"]').trigger('click')
    await flushPromises()

    const msg = w.get('[data-testid="submit-error"]').text()
    expect(msg).toContain('no está recibiendo pedidos')
    expect(msg).not.toContain('cash_closed')
  })
})

describe('el negocio cerrado', () => {
  it('se dice antes del carrito y bloquea el paso', async () => {
    storefrontMock.resolveTable.mockResolvedValue({ ...TABLE, canOrderNow: false })

    const w = await mountView()

    w.get('[data-testid="closed-notice"]')
    expect(
      (w.get('[data-testid="start-ordering"]').element as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('el pedido vivo', () => {
  const LIVE = {
    orderId: 'o1',
    status: 'open',
    kitchenState: 'sent',
    total: 28000,
    paid: 0,
    outstanding: 28000,
    editable: true,
    refusal: null,
    reason: null,
    contactPhone: null,
    paymentMethod: null,
    paymentProofPending: false,
    lines: [
      {
        itemId: 'i1',
        variantId: 'v1',
        name: 'Hamburguesa',
        quantity: 1,
        unitPrice: 28000,
        lineSubtotal: 28000,
        status: 'pending',
        addons: [],
        removedIngredients: [],
        note: '',
        removableIngredients: [],
        editable: false,
        refusal: 'in_kitchen',
        reason: 'Ya está en la plancha.',
      },
    ],
  }

  it('reabrir el QR en el mismo teléfono vuelve al pedido, no a un carrito vacío', async () => {
    localStorage.setItem('table-order:centro:M5CODE', 'tok-123')
    myOrderMock.getMyOrder.mockResolvedValue(LIVE)

    const w = await mountView()

    w.get('[data-testid="in-kitchen"]')
    expect(w.find('[data-testid="diner-name"]').exists()).toBe(false)
  })

  it('lo que la estación empezó se enseña sin controles y con el motivo', async () => {
    localStorage.setItem('table-order:centro:M5CODE', 'tok-123')
    myOrderMock.getMyOrder.mockResolvedValue(LIVE)

    const w = await mountView()

    expect(w.get('[data-testid="locked-line"]').text()).toContain('Ya está en la plancha')
  })

  it('un pedido que ya se cerró olvida el token y deja pedir de nuevo', async () => {
    // La mesa se recicla: el siguiente comensal no puede heredar el pedido del anterior.
    localStorage.setItem('table-order:centro:M5CODE', 'tok-viejo')
    myOrderMock.getMyOrder.mockResolvedValue({ ...LIVE, status: 'closed' })

    const w = await mountView()

    expect(localStorage.getItem('table-order:centro:M5CODE')).toBeNull()
    w.get('[data-testid="diner-name"]')
  })

  it('la segunda ronda se AÑADE al mismo pedido, no crea otro', async () => {
    localStorage.setItem('table-order:centro:M5CODE', 'tok-123')
    myOrderMock.getMyOrder.mockResolvedValue(LIVE)
    myOrderMock.editMyOrder.mockResolvedValue(LIVE)
    const w = await mountView()

    await w.get('[data-testid="another-round"]').trigger('click')
    seedCart()
    await w.vm.$nextTick()
    // La barra del carrito es el único camino del menú a la revisión: confirmar no puede
    // alcanzarse por accidente desde la carta.
    w.findComponent(CartBar).vm.$emit('open')
    await w.vm.$nextTick()
    await w.get('[data-testid="confirm"]').trigger('click')
    await flushPromises()

    expect(myOrderMock.editMyOrder).toHaveBeenCalledWith('tok-123', {
      add: [
        { variantId: 'v1', quantity: 1, addonIds: [], removedIngredients: [], note: '' },
      ],
    })
    expect(storefrontMock.createTableOrder).not.toHaveBeenCalled()
  })
})
