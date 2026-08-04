// La vista previa es la única forma de saber, antes de encender nada, que un mismo texto le
// manda a cada sede su propio enlace. Y que la variante de cerrado —la que nadie prueba— dice
// la hora de apertura de verdad.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import GreetingSection from '../GreetingSection.vue'

const PLACEHOLDERS = [
  'business_name',
  'branch_name',
  'branch_address',
  'branch_phone',
  'menu_link',
  'next_opening',
]
const IDENTITY = {
  businessName: 'Sabor Costeño',
  branchName: 'Sede Centro',
  branchAddress: 'Cra 5 #12-30',
  branchPhone: '3001112233',
}
const BRANCHES = [
  { id: 'b1', code: 'CENTRO', name: 'Sede Centro' },
  { id: 'b2', code: 'NORTE', name: 'Sede Norte' },
]

function mountSection(over: Record<string, unknown> = {}) {
  return mount(GreetingSection, {
    props: {
      enabled: true,
      openText: 'Bienvenido a {branch_name}. Carta: {menu_link}',
      closedText: 'Cerrados; abrimos {next_opening}. {menu_link}',
      awaitingText: '',
      awaitingPlaceholders: [...PLACEHOLDERS, 'order_number', 'order_total'],
      placeholders: PLACEHOLDERS,
      branches: BRANCHES,
      previewBranchId: 'b1',
      identity: IDENTITY,
      previewLink: 'https://demo.wsquote.uk/store/CENTRO?t=…',
      previewNextOpening: 'mañana a las 8:00',
      assistantOffer: false,
      disabled: false,
      ...over,
    },
  })
}

describe('GreetingSection', () => {
  it('pinta las dos variantes con los datos de la sede elegida', () => {
    const wrapper = mountSection()
    const open = wrapper.get('[data-testid="preview-open"]').text()
    const closed = wrapper.get('[data-testid="preview-closed"]').text()

    expect(open).toContain('Sede Centro')
    expect(open).toContain('store/CENTRO')
    // La de cerrado trae la apertura real, no el marcador.
    expect(closed).toContain('mañana a las 8:00')
    expect(closed).not.toContain('{next_opening}')
  })

  it('cambiar de sucursal cambia el enlace del mismo texto', async () => {
    const wrapper = mountSection()
    expect(wrapper.get('[data-testid="preview-open"]').text()).toContain('CENTRO')

    await wrapper.setProps({
      previewBranchId: 'b2',
      identity: { ...IDENTITY, branchName: 'Sede Norte' },
      previewLink: 'https://demo.wsquote.uk/store/NORTE?t=…',
    })

    const open = wrapper.get('[data-testid="preview-open"]').text()
    expect(open).toContain('Sede Norte')
    expect(open).toContain('store/NORTE')
  })

  it('avisa cuando la sede no tiene horarios: el marcador saldría sin resolver', () => {
    const wrapper = mountSection({ previewNextOpening: null })
    expect(wrapper.get('[data-testid="preview-closed"]').text()).toContain('{next_opening}')
    expect(wrapper.find('[data-testid="preview-no-hours"]').exists()).toBe(true)
  })

  it('un texto vacío enseña el de fábrica, con el nombre del NEGOCIO', () => {
    const wrapper = mountSection({ openText: '' })
    // El backend manda el de fábrica cuando el texto está vacío; la vista previa debe decir
    // lo mismo o mentiría sobre lo que va a salir. Y el de fábrica saluda con el negocio:
    // "Bienvenido a Main Branch" era el fallo que originó esto.
    const open = wrapper.get('[data-testid="preview-open"]').text()
    expect(open).toContain('Bienvenido a Sabor Costeño')
  })

  it('el saludo de fábrica no enseña el nombre crudo de la sucursal', () => {
    const wrapper = mountSection({
      openText: '',
      identity: { ...IDENTITY, branchName: 'Main Branch' },
    })
    expect(wrapper.get('[data-testid="preview-open"]').text()).not.toContain('Main Branch')
  })

  it('resuelve la dirección y el teléfono del Perfil del negocio', () => {
    const wrapper = mountSection({ openText: '{branch_address} · {branch_phone}' })
    const open = wrapper.get('[data-testid="preview-open"]').text()
    expect(open).toContain('Cra 5 #12-30')
    expect(open).toContain('3001112233')
  })

  it('enseña la oferta del asistente cuando está encendida', () => {
    const wrapper = mountSection({ assistantOffer: true })
    expect(wrapper.get('[data-testid="preview-open"]').text()).toContain('Escribe *1*')
  })

  it('la variante de cerrado no ofrece el asistente, y dice por qué', () => {
    // Fuera de horario el backend no añade la oferta: el asistente está apagado por horario.
    // Si la vista previa la pintara, enseñaría un saludo que no existe.
    const wrapper = mountSection({ assistantOffer: true })
    expect(wrapper.get('[data-testid="preview-closed"]').text()).not.toContain('Escribe *1*')
    expect(wrapper.get('[data-testid="preview-closed-no-offer"]').text()).toContain(
      'Fuera de horario no se ofrece el asistente',
    )
  })

  it('nombra el marcador que no existe mientras se escribe', () => {
    const wrapper = mountSection({ openText: 'Hola {cliente}' })
    const alert = wrapper.get('[data-testid="greeting-open-unknown"]')
    expect(alert.text()).toContain('{cliente}')
  })

  it('con el saludo apagado dice qué pasa: nadie recibe nada', () => {
    const wrapper = mountSection({ enabled: false })
    expect(wrapper.get('[data-testid="greeting-off-notice"]').text()).toContain(
      'espera a que una persona la conteste',
    )
  })

  it('el interruptor emite el cambio en vez de mutar la prop', async () => {
    const wrapper = mountSection()
    await wrapper.get('[data-testid="greeting-toggle"]').trigger('click')
    expect(wrapper.emitted('update:enabled')?.[0]).toEqual([false])
  })

  it('insertar un marcador lo mete en el texto', async () => {
    const wrapper = mountSection({ openText: 'Hola' })
    const chip = wrapper.findAll('button').find((b) => b.text() === '{menu_link}')
    await chip?.trigger('click')
    expect(wrapper.emitted('update:openText')?.[0]?.[0]).toContain('{menu_link}')
  })
})
