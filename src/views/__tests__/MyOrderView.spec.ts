// «Mi pedido» desde fuera: lo que el cliente ve y lo que se manda cuando confirma.
//
// Lo que estas pruebas cuidan no es el pintado, es la honestidad: que lo que ya no se puede
// cambiar se vea y se explique, que la cifra a pagar aparezca ANTES de confirmar, y que un no
// del servidor no se pinte como un sí.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// El doble de la excepción se define DENTRO del `vi.hoisted`: la fábrica de `vi.mock` sube al
// principio del fichero y no puede mirar nada declarado después.
const api = vi.hoisted(() => {
  class MyOrderRefusedStub extends Error {
    constructor(
      readonly refusal: string | null,
      message: string,
    ) {
      super(message)
      this.name = 'MyOrderRefused'
    }
  }
  return {
    getMyOrder: vi.fn<(...a: unknown[]) => unknown>(),
    editMyOrder: vi.fn<(...a: unknown[]) => unknown>(),
    MyOrderRefused: MyOrderRefusedStub,
  }
})
vi.mock('@/services/myOrder.api', () => api)
const MyOrderRefusedStub = api.MyOrderRefused

const proofApi = vi.hoisted(() => {
  class ProofUploadFailedStub extends Error {}
  return {
    uploadPaymentProof: vi.fn<(...a: unknown[]) => unknown>(),
    ProofUploadFailed: ProofUploadFailedStub,
    MAX_PROOF_BYTES: 5 * 1024 * 1024,
    PROOF_ACCEPT: 'image/png',
  }
})
vi.mock('@/services/paymentProof.api', () => proofApi)

const storefront = vi.hoisted(() => ({
  getAppearance: vi.fn<(...a: unknown[]) => unknown>(),
  getMenu: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/storefront.api', () => storefront)

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { token: 'tok-123' } }),
  RouterLink: { template: '<a><slot /></a>' },
}))

import MyOrderView from '../MyOrderView.vue'
import { mockPublishedConfig } from '@/mock/menuAppearance'
import type { MyOrder, MyOrderLine } from '@/services/myOrder.api'

const PRODUCT = {
  id: 'p1',
  categoryId: 'c1',
  name: 'Hamburguesa',
  description: '',
  price: 20000,
  imageUrl: '',
  variantId: 'v1',
  removableIngredients: ['Cebolla', 'Tomate'],
  addonIds: ['queso'],
}

function line(over: Partial<MyOrderLine> = {}): MyOrderLine {
  return {
    itemId: 'i1',
    variantId: 'v1',
    name: 'Hamburguesa',
    quantity: 1,
    unitPrice: 20000,
    lineSubtotal: 20000,
    status: 'pending',
    addons: [],
    removedIngredients: ['Cebolla'],
    note: 'tocar timbre',
    removableIngredients: ['Cebolla', 'Tomate'],
    editable: true,
    refusal: null,
    reason: null,
    ...over,
  }
}

function order(over: Partial<MyOrder> = {}): MyOrder {
  return {
    orderId: 'o1',
    status: 'open',
    kitchenState: 'none',
    total: 20000,
    paid: 0,
    outstanding: 20000,
    editable: true,
    refusal: null,
    reason: null,
    lines: [line()],
    contactPhone: '+57 300 111 2233',
    paymentMethod: 'cash',
    paymentProofPending: false,
    ...over,
  }
}

async function open(current: MyOrder | null) {
  api.getMyOrder.mockResolvedValue(current)
  const wrapper = mount(MyOrderView)
  await flushPromises()
  return wrapper
}

/** Despliega los controles de la primera línea ("Corregir"). */
async function expand(wrapper: Awaited<ReturnType<typeof open>>) {
  const toggle = wrapper.findAll('button').find((b) => b.text() === 'Corregir')
  await toggle?.trigger('click')
}

function buttonWith(wrapper: Awaited<ReturnType<typeof open>>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  storefront.getAppearance.mockResolvedValue(mockPublishedConfig)
  storefront.getMenu.mockResolvedValue({
    categories: [{ id: 'c1', name: 'Hamburguesas' }],
    products: [PRODUCT],
    addons: [{ id: 'queso', name: 'Queso extra', price: 3000 }],
  })
})

describe('lo que ya se eligió', () => {
  it('enseña las exclusiones actuales marcadas, junto a las demás', async () => {
    const wrapper = await open(order())
    await expand(wrapper)

    const cebolla = buttonWith(wrapper, 'Sin cebolla')
    const tomate = buttonWith(wrapper, 'Sin tomate')
    expect(cebolla?.attributes('aria-pressed')).toBe('true')
    expect(tomate?.attributes('aria-pressed')).toBe('false')
    // La nota que ya había se edita; no se pide reescribirla.
    expect(wrapper.get('textarea').element.value).toBe('tocar timbre')
  })

  it('al añadir una exclusión conserva la anterior y la nota', async () => {
    api.editMyOrder.mockResolvedValue(order())
    const wrapper = await open(order())
    await expand(wrapper)
    await buttonWith(wrapper, 'Sin tomate')?.trigger('click')
    await buttonWith(wrapper, 'Confirmar cambios')?.trigger('click')
    await flushPromises()

    expect(api.editMyOrder).toHaveBeenCalledWith('tok-123', {
      edit: [
        { itemId: 'i1', removedIngredients: ['Cebolla', 'Tomate'], note: 'tocar timbre' },
      ],
    })
  })
})

describe('lo que ya no se puede cambiar', () => {
  it('deja el renglón inerte y escribe el motivo, en vez de esconderlo', async () => {
    const wrapper = await open(
      order({
        lines: [
          line({ editable: false, refusal: 'item_started', reason: 'Ya están preparando eso.' }),
        ],
      }),
    )
    expect(wrapper.text()).toContain('Hamburguesa')
    expect(wrapper.text()).toContain('Ya están preparando eso.')
    expect(buttonWith(wrapper, 'Corregir')).toBeUndefined()
  })

  it('con el pedido fuera de alcance se explica y ofrece una persona', async () => {
    const wrapper = await open(
      order({
        editable: false,
        refusal: 'out_of_reach',
        reason: 'Tu pedido ya salió; para cualquier cambio te atiende una persona.',
      }),
    )
    expect(wrapper.text()).toContain('Tu pedido ya salió')
    expect(wrapper.text()).toContain('¿Quitar algo o cancelar?')
    expect(wrapper.get('a[href^="https://wa.me/"]').attributes('href')).toBe(
      'https://wa.me/573001112233',
    )
    // Y no se ofrece añadir sobre un pedido que ya salió.
    expect(buttonWith(wrapper, 'Añadir algo más')).toBeUndefined()
  })
})

describe('lo que se va a pagar', () => {
  it('enseña el delta y el saldo proyectado ANTES de confirmar', async () => {
    const wrapper = await open(order({ paid: 20000, outstanding: 0 }))
    await expand(wrapper)
    await buttonWith(wrapper, 'Queso extra')?.trigger('click')

    const text = wrapper.text()
    expect(text).toContain('3.000')
    expect(text).toContain('se paga al recibir')
    // Ya pagó el pedido entero: lo que queda debiendo es exactamente la adición.
    expect(text).toContain('Ya pagaste')
    expect(api.editMyOrder).not.toHaveBeenCalled()
  })

  it('dice cómo se cobra la diferencia cuando el cliente eligió pagar por adelantado', async () => {
    // El caso real: pidio por transferencia, anade algo y el total sube. "Se paga al recibir"
    // seria mentira, y no decir nada lo deja buscando un boton de pagar que no existe.
    const wrapper = await open(order({ paymentMethod: 'transfer' }))
    expect(wrapper.text()).toContain('Elegiste pagar por adelantado')
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(true)
  })

  it('sigue explicando el saldo DESPUÉS de confirmar, no sólo antes', async () => {
    api.editMyOrder.mockResolvedValue(order({ total: 23000, outstanding: 23000 }))
    const wrapper = await open(order())
    await expand(wrapper)
    await buttonWith(wrapper, 'Queso extra')?.trigger('click')
    await buttonWith(wrapper, 'Confirmar cambios')?.trigger('click')
    await flushPromises()

    // La barra de confirmar ya no esta; la explicacion del saldo tiene que seguir.
    expect(buttonWith(wrapper, 'Confirmar cambios')).toBeUndefined()
    expect(wrapper.text()).toContain('Se paga al recibir el pedido')
  })

  it('no cobra por corregir una nota, y lo dice', async () => {
    const wrapper = await open(order())
    await expand(wrapper)
    await wrapper.get('textarea').setValue('mejor sin picante')
    expect(wrapper.text()).toContain('Sin costo adicional')
  })
})

describe('cuando el servidor dice que no', () => {
  it('enseña su motivo y vuelve a pintar el pedido como está de verdad', async () => {
    api.editMyOrder.mockRejectedValue(
      new MyOrderRefusedStub('item_started', 'Ya están preparando eso, así que no se puede cambiar.'),
    )
    // La relectura devuelve la realidad: ese renglón ya entró a la plancha.
    const after = order({
      lines: [line({ editable: false, refusal: 'item_started', reason: 'Ya están preparando eso.' })],
    })
    api.getMyOrder.mockResolvedValueOnce(order()).mockResolvedValue(after)

    const wrapper = mount(MyOrderView)
    await flushPromises()
    await expand(wrapper)
    // El "+" es un icono sin texto: se busca por su etiqueta accesible.
    await wrapper.get('[aria-label="Agregar uno"]').trigger('click')
    await buttonWith(wrapper, 'Confirmar cambios')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Ya están preparando eso')
    // El cambio NO se pinta como aplicado: la cantidad vuelve a ser la que hay.
    expect(wrapper.text()).toContain('1×')
    expect(wrapper.text()).not.toContain('Listo, ya lo tenemos en cuenta')
    expect(buttonWith(wrapper, 'Confirmar cambios')).toBeUndefined()
  })
})

describe('un enlace que ya no sirve', () => {
  it('se explica sin decir si el pedido existe', async () => {
    const wrapper = await open(null)
    expect(wrapper.text()).toContain('Este enlace ya no sirve')
    expect(wrapper.text()).not.toContain('Hamburguesa')
  })
})


describe('pagar lo que falta', () => {
  const receipt = () => new File(['bytes'], 'comprobante.jpg', { type: 'image/jpeg' })

  it('ofrece mandar el comprobante y también WhatsApp cuando el método es de prepago', async () => {
    const wrapper = await open(order({ paymentMethod: 'transfer' }))
    expect(wrapper.text()).toContain('Falta por pagar')
    expect(buttonWith(wrapper, 'Enviar comprobante')).toBeDefined()
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(true)
  })

  it('enseña el SALDO, nunca el total del pedido', async () => {
    // Ya pagó 40.000 de 42.500: lo que se manda son 2.500.
    const wrapper = await open(
      order({ paymentMethod: 'transfer', total: 42500, paid: 40000, outstanding: 2500 }),
    )
    expect(buttonWith(wrapper, 'Enviar comprobante')?.text()).toContain('2.500')
    expect(buttonWith(wrapper, 'Enviar comprobante')?.text()).not.toContain('42.500')
  })

  it('no le pide comprobante a quien paga al recibir', async () => {
    const wrapper = await open(order({ paymentMethod: 'cash' }))
    expect(buttonWith(wrapper, 'Enviar comprobante')).toBeUndefined()
    expect(wrapper.text()).toContain('Se paga al recibir')
  })

  it('mandado NO es pagado: el saldo sigue y se dice que falta confirmarlo', async () => {
    const sent = order({ paymentMethod: 'transfer', paymentProofPending: true })
    proofApi.uploadPaymentProof.mockResolvedValue({ claimId: 'c1', status: 'pending', order: sent })
    const wrapper = await open(order({ paymentMethod: 'transfer' }))

    // Se emite el archivo como lo hace el propio componente al elegirlo: un `change` sobre un
    // input de fichero no lleva `files` en jsdom.
    wrapper.findComponent({ name: 'SettleBalance' }).vm.$emit('send', receipt())
    await flushPromises()

    expect(proofApi.uploadPaymentProof).toHaveBeenCalledWith('tok-123', expect.anything(), 20000)
    expect(wrapper.text()).toContain('lo está confirmando')
    expect(wrapper.text()).toContain('20.000')
  })

  it('una subida fallida se dice y deja la ruta de WhatsApp en pie', async () => {
    proofApi.uploadPaymentProof.mockRejectedValue(
      new proofApi.ProofUploadFailed('No pudimos subir tu comprobante.'),
    )
    const wrapper = await open(order({ paymentMethod: 'transfer' }))

    wrapper.findComponent({ name: 'SettleBalance' }).vm.$emit('send', receipt())
    await flushPromises()

    expect(wrapper.text()).toContain('No pudimos subir tu comprobante')
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(true)
  })
})
