// El panel de tarifas. Lo que se protege: que no se pueda guardar un plan roto, que el permiso
// se note, y que la pantalla diga las dos cosas que el operador NO puede deducir de los números
// — el colchón de 0,7 km y hasta dónde reparte la sede.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TariffPanel from '../TariffPanel.vue'
import type { BandDraft } from '@/lib/tariffBands'

const VALID: BandDraft[] = [
  { maxKm: '2', fee: '3000' },
  { maxKm: '4', fee: '5000' },
]

function panel(props: Partial<{ bands: BandDraft[]; readonly: boolean; saving: boolean }> = {}) {
  return mount(TariffPanel, {
    props: { bands: VALID, open: true, ...props },
  })
}

const saveButton = (w: ReturnType<typeof panel>) => w.find('[data-testid="save-tariffs"]')

describe('guardar', () => {
  it('un plan válido se puede guardar', () => {
    expect(saveButton(panel()).attributes('disabled')).toBeUndefined()
  })

  it('emite el guardado con el plan actual', async () => {
    const wrapper = panel()

    await saveButton(wrapper).trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('un plan con distancias que no crecen NO se puede guardar', () => {
    const wrapper = panel({ bands: [{ maxKm: '4', fee: '3000' }, { maxKm: '2', fee: '5000' }] })

    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('más lejos que la anterior')
  })

  it('un plan vacío no se puede guardar, y se explica qué pasa si se deja así', () => {
    const wrapper = panel({ bands: [] })

    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    // El coste real de no configurarlo, dicho: los pedidos se quedan esperando.
    expect(wrapper.text()).toContain('no se cotiza ningún domicilio')
  })

  it('una tarifa negativa se señala en su propia banda', () => {
    const wrapper = panel({ bands: [{ maxKm: '2', fee: '-5' }] })

    expect(wrapper.text()).toContain('no puede ser negativa')
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('mientras guarda no se puede volver a pulsar', () => {
    const wrapper = panel({ saving: true })

    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Guardando…')
  })
})

describe('editar', () => {
  it('cambiar un kilómetro emite el plan entero, no la fila', async () => {
    const wrapper = panel()

    const kmInput = wrapper.findAll('input')[0]!
    await kmInput.setValue('3')

    const emitted = wrapper.emitted('update:bands')?.[0]?.[0] as BandDraft[]
    expect(emitted).toHaveLength(2)
    expect(emitted[0]?.maxKm).toBe('3')
    // La segunda banda no se toca: el plan se reemplaza, no se muta.
    expect(emitted[1]).toEqual(VALID[1])
  })

  it('añadir una banda la coloca más allá del borde, no ya en rojo', async () => {
    const wrapper = panel()

    await wrapper.findAll('button').find((b) => b.text().includes('Añadir banda'))!.trigger('click')

    const emitted = wrapper.emitted('update:bands')?.[0]?.[0] as BandDraft[]
    expect(emitted).toHaveLength(3)
    expect(Number(emitted[2]?.maxKm)).toBeGreaterThan(Number(VALID[1]!.maxKm))
  })

  it('quitar una banda la saca del plan', async () => {
    const wrapper = panel()

    await wrapper.find('button[aria-label^="Quitar la banda"]').trigger('click')

    const emitted = wrapper.emitted('update:bands')?.[0]?.[0] as BandDraft[]
    expect(emitted).toEqual([VALID[1]])
  })
})

describe('lo que el operador no puede deducir de los números', () => {
  it('dice el colchón de 0,7 km y por qué existe', () => {
    expect(panel().text()).toContain('0.7')
    expect(panel().text()).toContain('nadie va en línea recta')
  })

  it('dice hasta dónde reparte la sede y qué pasa más allá', () => {
    const wrapper = panel()

    expect(wrapper.text()).toContain('4 km')
    expect(wrapper.text()).toContain('fuera de cobertura')
  })

  it('con el plan roto no promete ninguna cobertura', () => {
    const wrapper = panel({ bands: [{ maxKm: '4', fee: '3000' }, { maxKm: '2', fee: '5000' }] })

    expect(wrapper.find('[data-testid="tariff-toggle"]').text()).toContain('—')
  })
})

describe('sin permiso de gestión', () => {
  it('se ve el plan pero no se puede tocar', () => {
    const wrapper = panel({ readonly: true })

    expect(saveButton(wrapper).exists()).toBe(false)
    expect(wrapper.find('button[aria-label^="Quitar la banda"]').exists()).toBe(false)
    expect(wrapper.findAll('input').every((i) => i.attributes('disabled') !== undefined)).toBe(true)
    // Y se dice por qué, en vez de dejar controles muertos sin explicación.
    expect(wrapper.text()).toContain('Necesitas permiso')
  })
})
