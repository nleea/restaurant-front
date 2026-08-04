// La aritmética de «mi pedido», sin pantalla ni red. Dos cosas que no pueden fallar:
// que el delta sea el MISMO número que calculará el servidor, y que la nota y las exclusiones
// viajen siempre juntas.
import { describe, expect, it } from 'vitest'
import { draftFor, editDelta, hasChanges, lineDelta, toPayload } from '@/lib/myOrder'
import type { MyOrder, MyOrderLine } from '@/services/myOrder.api'

const ADDON_PRICE: Record<string, number> = { queso: 3000, tocineta: 5000 }
const priceOf = (id: string) => ADDON_PRICE[id] ?? 0

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

function order(lines: MyOrderLine[]): MyOrder {
  const total = lines.reduce((s, l) => s + l.lineSubtotal, 0)
  return {
    orderId: 'o1',
    status: 'open',
    kitchenState: 'none',
    total,
    paid: 0,
    outstanding: total,
    editable: true,
    refusal: null,
    reason: null,
    lines,
    contactPhone: '+573001112233',
    paymentMethod: 'cash',
    paymentProofPending: false,
  }
}

describe('el delta de una línea', () => {
  it('vale cero mientras nadie toque nada', () => {
    const l = line()
    expect(lineDelta(l, draftFor(l), priceOf)).toBe(0)
  })

  it('cobra la cantidad de más al precio de la línea', () => {
    const l = line({ quantity: 2 })
    expect(lineDelta(l, { ...draftFor(l), quantity: 4 }, priceOf)).toBe(40000)
  })

  it('valora el cambio de plato sobre la cantidad ANTERIOR, y la cantidad nueva sobre el precio nuevo', () => {
    // Mismo orden de operaciones que el servidor: 2 unidades suben 5.000 (=10.000) y la tercera
    // entra ya a 25.000. Un orden distinto daría 35.000 y el cliente vería una cifra que no es.
    const l = line({ quantity: 2, unitPrice: 20000, lineSubtotal: 40000 })
    const draft = { ...draftFor(l), quantity: 3, variantId: 'v2', variantPrice: 25000 }
    expect(lineDelta(l, draft, priceOf)).toBe(35000)
  })

  it('suma cada adición nueva', () => {
    const l = line()
    expect(lineDelta(l, { ...draftFor(l), addAddonIds: ['queso', 'tocineta'] }, priceOf)).toBe(8000)
  })

  it('no cobra nada por corregir una nota o una exclusión', () => {
    const l = line()
    const draft = { ...draftFor(l), removedIngredients: ['Cebolla', 'Tomate'], note: 'sin sal' }
    expect(lineDelta(l, draft, priceOf)).toBe(0)
  })
})

describe('el cuerpo del PATCH', () => {
  it('no manda nada de una línea intacta', () => {
    const l = line()
    const o = order([l])
    const drafts = { i1: draftFor(l) }
    expect(hasChanges(o, drafts, [])).toBe(false)
    expect(toPayload(o, drafts, [])).toEqual({})
  })

  it('manda la nota y las exclusiones JUNTAS aunque sólo cambie una', () => {
    // El servidor compone una sola cadena con las dos. Mandar la nota sola borraría el
    // "sin cebolla" que ya estaba, y la cocina no puede notar lo que ya no está escrito.
    const l = line()
    const o = order([l])
    const drafts = { i1: { ...draftFor(l), note: 'sin sal por favor' } }
    expect(toPayload(o, drafts, []).edit).toEqual([
      { itemId: 'i1', removedIngredients: ['Cebolla'], note: 'sin sal por favor' },
    ])
  })

  it('conserva las exclusiones anteriores al añadir una nueva', () => {
    const l = line()
    const o = order([l])
    const drafts = { i1: { ...draftFor(l), removedIngredients: ['Cebolla', 'Tomate'] } }
    expect(toPayload(o, drafts, []).edit?.[0]).toEqual({
      itemId: 'i1',
      removedIngredients: ['Cebolla', 'Tomate'],
      note: 'tocar timbre',
    })
  })

  it('no incluye verbos para lo que esta vía no hace', () => {
    const l = line({ quantity: 2 })
    const o = order([l])
    const drafts = { i1: { ...draftFor(l), quantity: 3, addAddonIds: ['queso'] } }
    const payload = toPayload(o, drafts, [])
    expect(payload.edit).toEqual([{ itemId: 'i1', quantity: 3, addAddonIds: ['queso'] }])
    expect(JSON.stringify(payload)).not.toContain('remove')
  })

  it('suma los añadidos al delta y los manda como líneas nuevas', () => {
    const l = line()
    const o = order([l])
    const drafts = { i1: draftFor(l) }
    const additions = [
      {
        uid: 'a1',
        variantId: 'v9',
        name: 'Limonada',
        quantity: 2,
        unitPrice: 6000,
        addonIds: ['queso'],
        removedIngredients: [],
        note: '',
      },
    ]
    expect(editDelta(o, drafts, additions, priceOf)).toBe(15000)
    expect(toPayload(o, drafts, additions).add).toEqual([
      {
        variantId: 'v9',
        quantity: 2,
        addonIds: ['queso'],
        removedIngredients: [],
        note: '',
      },
    ])
  })
})
