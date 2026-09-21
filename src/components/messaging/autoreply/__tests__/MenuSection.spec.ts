// El menú de opciones: la respuesta que evita el silencio en un chat abierto.
//
// La sección tiene que dejar claro qué entiende el sistema —sin eso, el dueño escribe un menú
// que no se corresponde con nada— y enseñar el texto que va a salir, con el de fábrica cuando
// el campo está vacío (que es lo que el backend manda de verdad).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import MenuSection from '../MenuSection.vue'

const PLACEHOLDERS = [
  'business_name',
  'branch_name',
  'branch_address',
  'branch_phone',
  'menu_link',
]
const DEFAULT_TEXT =
  '¡Con gusto! Dime qué necesitas:\n• *pedido* — hacer un pedido nuevo\n• *estado* — ver cómo va mi pedido\n• *persona* — hablar con alguien del equipo'
const IDENTITY = {
  businessName: 'Sabor Costeño',
  branchName: 'Sede Centro',
  branchAddress: 'Cra 5 #12-30',
  branchPhone: '3001112233',
}

function mountSection(over: Record<string, unknown> = {}) {
  return mount(MenuSection, {
    props: {
      enabled: true,
      text: '',
      placeholders: PLACEHOLDERS,
      defaultText: DEFAULT_TEXT,
      identity: IDENTITY,
      previewLink: 'https://demo.wsquote.uk/store/CENTRO?t=…',
      disabled: false,
      ...over,
    },
  })
}

describe('MenuSection', () => {
  it('con el texto vacío enseña el de fábrica, que es lo que sale de verdad', () => {
    const wrapper = mountSection()
    const preview = wrapper.get('[data-testid="menu-preview"]').text()
    expect(preview).toContain('pedido')
    expect(preview).toContain('estado')
    expect(preview).toContain('persona')
    expect(wrapper.find('[data-testid="menu-default-note"]').exists()).toBe(true)
  })

  it('resuelve los marcadores del negocio y el enlace de la sede', () => {
    const wrapper = mountSection({ text: 'Escríbenos a {branch_name}: {menu_link}' })
    const preview = wrapper.get('[data-testid="menu-preview"]').text()
    expect(preview).toContain('Sede Centro')
    expect(preview).toContain('store/CENTRO')
    expect(preview).not.toContain('{menu_link}')
  })

  it('explica qué opciones reconoce el sistema', () => {
    const wrapper = mountSection()
    const notice = wrapper.get('[data-testid="menu-options-notice"]').text()
    expect(notice).toContain('pedido')
    expect(notice).toContain('estado')
    expect(notice).toContain('persona')
    expect(notice).toContain('1, 2 y 3')
  })

  it('nombra el marcador que no existe mientras se escribe', () => {
    const wrapper = mountSection({ text: 'Hola {cliente}' })
    expect(wrapper.get('[data-testid="menu-unknown"]').text()).toContain('{cliente}')
  })

  it('con el menú apagado dice qué pasa: el mensaje se queda sin respuesta', () => {
    const wrapper = mountSection({ enabled: false })
    expect(wrapper.get('[data-testid="menu-off-notice"]').text()).toContain('se queda sin respuesta')
  })

  it('el interruptor emite el cambio en vez de mutar la prop', async () => {
    const wrapper = mountSection()
    await wrapper.get('[data-testid="menu-toggle"]').trigger('click')
    expect(wrapper.emitted('update:enabled')?.[0]).toEqual([false])
  })

  it('insertar un marcador lo mete en el texto', async () => {
    const wrapper = mountSection({ text: 'Hola' })
    const chip = wrapper.findAll('button').find((b) => b.text() === '{menu_link}')
    await chip?.trigger('click')
    expect(wrapper.emitted('update:text')?.[0]?.[0]).toContain('{menu_link}')
  })
})
