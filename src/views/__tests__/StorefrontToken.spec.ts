// El enlace del saludo trae `?t=<token>`. Lo que hace es quitarle tecleo a alguien que ya nos
// dijo su nombre y su teléfono por WhatsApp, y enlazar el pedido con ese contacto para que
// después le llegue "va en camino". Lo que NO hace es autenticar ni aparecer en pantalla.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const storefrontMock = vi.hoisted(() => ({
  getBranches: vi.fn<(...a: unknown[]) => unknown>(),
  getStorefrontHours: vi.fn<(...a: unknown[]) => unknown>(),
  getAppearance: vi.fn<(...a: unknown[]) => unknown>(),
  getMenu: vi.fn<(...a: unknown[]) => unknown>(),
  createOrder: vi.fn<(...a: unknown[]) => unknown>(),
  resolveStoreSession: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/storefront.api', () => storefrontMock)

const guestMock = vi.hoisted(() => ({ getGuestProfile: vi.fn<(...a: unknown[]) => unknown>(), saveGuestProfile: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/guestProfile.api', () => guestMock)

// La vista lee la sede de la ruta; aquí basta con una ruta fija más la query del token.
const routeMock = vi.hoisted(() => ({ params: {} as Record<string, string>, query: {} as Record<string, string> }))
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn<(...a: unknown[]) => unknown>() }),
}))

import StorefrontView from '../StorefrontView.vue'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'

async function mountStore(query: Record<string, string> = {}) {
  routeMock.params = { branchCode: 'CENTRO' }
  routeMock.query = query
  const wrapper = mount(StorefrontView)
  await flushPromises()
  await flushPromises()
  return wrapper
}

/** Un carrito listo para confirmar: una línea, retiro en tienda y método de pago. */
function fillCart(): void {
  const cart = useCartStore()
  cart.setContact({ name: 'Ana', phone: '+573001112233' })
  cart.setFulfillment('pickup')
  cart.setPayment('cash')
  cart.addItem({
    productId: 'p1',
    variantId: 'v1',
    name: 'Arepa',
    unitPrice: 5000,
    quantity: 1,
    addons: [],
    removed: [],
    note: '',
  })
}

/** Confirmar sin recorrer los cuatro pasos de la UI: lo que se prueba es el payload. */
async function confirmFrom(wrapper: ReturnType<typeof mount>): Promise<void> {
  await (wrapper.vm as unknown as { confirmOrder: () => Promise<void> }).confirmOrder()
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  storefrontMock.getBranches.mockResolvedValue([
    { id: 'b1', code: 'CENTRO', name: 'Sede Centro', address: null },
  ])
  storefrontMock.getStorefrontHours.mockResolvedValue({
    isOpenNow: true,
    nextOpening: null,
    windows: [],
  })
  storefrontMock.getAppearance.mockRejectedValue(new Error('sin config'))
  storefrontMock.getMenu.mockResolvedValue({ categories: [], products: [], addons: [] })
  storefrontMock.createOrder.mockResolvedValue({ orderId: 'o1', orderNumber: 'A-1', status: 'open' })
  storefrontMock.resolveStoreSession.mockResolvedValue({
    name: 'Ana',
    phone: '+573001112233',
    branchCode: 'CENTRO',
  })
  // Sin perfil de invitado guardado: el token es la única fuente de precarga.
  guestMock.getGuestProfile.mockResolvedValue({ name: '', phone: '', address: '' })
  guestMock.saveGuestProfile.mockResolvedValue(undefined)
})

describe('el token del enlace de WhatsApp', () => {
  it('precarga nombre y teléfono al llegar desde el saludo', async () => {
    await mountStore({ t: 'tok-123' })

    expect(storefrontMock.resolveStoreSession).toHaveBeenCalledWith('tok-123')
    const cart = useCartStore()
    expect(cart.customerName).toBe('Ana')
    expect(cart.customerPhone).toBe('+573001112233')
  })

  it('lo precargado se puede corregir, y se manda corregido', async () => {
    await mountStore({ t: 'tok-123' })
    const cart = useCartStore()

    // El token precarga; no autentica. El cliente manda.
    cart.setContact({ name: 'Ana María', phone: '+573009998877' })
    expect(cart.customerName).toBe('Ana María')
    expect(cart.customerPhone).toBe('+573009998877')
  })

  it('un token vencido deja el checkout vacío, sin error', async () => {
    // Desconocido y vencido responden lo mismo (404). Quien llega con un enlace viejo no ha
    // hecho nada malo: enseñarle un error sólo le diría que el restaurante está roto.
    storefrontMock.resolveStoreSession.mockResolvedValue(null)
    const wrapper = await mountStore({ t: 'vencido' })

    const cart = useCartStore()
    expect(cart.customerName).toBe('')
    expect(cart.customerPhone).toBe('')
    expect(wrapper.text()).not.toContain('vencido')
  })

  it('sin token no se pregunta por ninguna sesión', async () => {
    await mountStore()
    expect(storefrontMock.resolveStoreSession).not.toHaveBeenCalled()
  })

  it('el token no aparece en ningún campo visible', async () => {
    const wrapper = await mountStore({ t: 'tok-secreto' })
    // Es una credencial de portador: un token en pantalla acaba en una captura compartida.
    expect(wrapper.text()).not.toContain('tok-secreto')
    expect(wrapper.html()).not.toContain('tok-secreto')
  })

  it('el pedido viaja con el token para enlazarse al contacto', async () => {
    const wrapper = await mountStore({ t: 'tok-123' })
    fillCart()

    await confirmFrom(wrapper)

    expect(storefrontMock.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ storeToken: 'tok-123' }),
      'CENTRO',
    )
  })

  it('gana sobre el perfil de invitado: es quien acaba de escribirnos', async () => {
    // El perfil es una cookie de este dispositivo; el token es la persona que escribió al
    // número y pulsó ESTE enlace. Y es el contacto al que después le llegará "va en camino".
    guestMock.getGuestProfile.mockResolvedValue({
      name: 'Nombre viejo',
      phone: '+573000000000',
      address: 'Calle 1',
    })

    await mountStore({ t: 'tok-123' })

    const cart = useCartStore()
    expect(cart.customerName).toBe('Ana')
    expect(cart.customerPhone).toBe('+573001112233')
  })

  it('una sesión de staff en el navegador no apaga ninguna precarga', async () => {
    // Antes las apagaba las dos. Pero un token en localStorage es de STAFF —el dueño probando
    // su propia tienda, o la tablet del local— y no significa que ESTE cliente tenga cuenta:
    // aquí no hay login de clientes. La tienda es pública y se comporta igual con sesión o sin.
    useAuthStore().accessToken = 'jwt'

    await mountStore({ t: 'tok-123' })

    expect(storefrontMock.resolveStoreSession).toHaveBeenCalledWith('tok-123')
    expect(guestMock.getGuestProfile).toHaveBeenCalled()
  })

  it('sin token el pedido se crea igual, sólo que sin enlazar', async () => {
    // El token sólo suma: sin él el backend empareja por teléfono, como siempre.
    const wrapper = await mountStore()
    fillCart()

    await confirmFrom(wrapper)

    expect(storefrontMock.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ storeToken: undefined }),
      'CENTRO',
    )
  })
})
