// Encender un aviso es un clic; el coste no se ve. El contador es lo que lo hace visible, y
// la advertencia es lo que separa "cuatro mensajes" de "un número marcado por WhatsApp".
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import StatusMappingSection from '../StatusMappingSection.vue'
import type { StatusMessage } from '@/services/messaging.api'

const ORDER_PLACEHOLDERS = ['branch_name', 'order_number', 'order_total']

const on = (text = 'Aviso {order_number}'): StatusMessage => ({ enabled: true, text })
const off = (text = 'Aviso {order_number}'): StatusMessage => ({ enabled: false, text })

function mountSection(mapping: Record<string, StatusMessage>) {
  return mount(StatusMappingSection, {
    props: { mapping, placeholders: ORDER_PLACEHOLDERS, disabled: false },
  })
}

describe('StatusMappingSection', () => {
  it('dice cuántos mensajes manda un pedido normal', () => {
    const wrapper = mountSection({ order_received: on(), on_the_way: on(), ready: off() })
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('2')
  })

  it('no advierte con el mapeo de fábrica', () => {
    const wrapper = mountSection({
      order_received: on(),
      on_the_way: on(),
      delivered: on(),
      cancelled: on(),
      ready: off(),
      assigned: off(),
    })
    // Cuatro encendidos, pero `cancelled` es el otro final del pedido: son 3 mensajes.
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('3')
    expect(wrapper.find('[data-testid="chatty-warning"]').exists()).toBe(false)
  })

  it('advierte cuando el pedido pasa del techo recomendado', async () => {
    const wrapper = mountSection({
      order_received: on(),
      assigned: on(),
      on_the_way: on(),
      delivered: on(),
    })
    // Cuatro es justo el techo: todavía no hay nada que advertir.
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('4')
    expect(wrapper.find('[data-testid="chatty-warning"]').exists()).toBe(false)

    await wrapper.setProps({
      mapping: {
        order_received: on(),
        ready: on(),
        assigned: on(),
        on_the_way: on(),
        delivered: on(),
      },
    })

    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('5')
    expect(wrapper.get('[data-testid="chatty-warning"]').text()).toContain('riesgo el número')
  })

  it('el contador baja al apagar un aviso', async () => {
    const wrapper = mountSection({ order_received: on(), on_the_way: on() })
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('2')

    await wrapper.setProps({ mapping: { order_received: on(), on_the_way: off() } })
    expect(wrapper.get('[data-testid="message-count"]').text()).toContain('1')
  })

  it('sólo deja editar el texto de lo que está encendido', () => {
    const wrapper = mountSection({ order_received: on(), ready: off() })
    const enabled = wrapper.get('[data-transition="order_received"]')
    const disabled = wrapper.get('[data-transition="ready"]')
    expect(enabled.find('textarea').exists()).toBe(true)
    // Un texto que no se manda no se edita: sería un borrador invisible en producción.
    expect(disabled.find('textarea').exists()).toBe(false)
  })

  it('lista las seis transiciones, encendidas o no', () => {
    const wrapper = mountSection({ order_received: on() })
    expect(wrapper.findAll('[data-transition]')).toHaveLength(6)
  })

  it('nombra un marcador que no existe en un aviso de pedido', () => {
    // `{menu_link}` es válido en el saludo y NO aquí: saldría con un hueco.
    const wrapper = mountSection({ order_received: on('Mira {menu_link}') })
    expect(wrapper.get('[data-transition="order_received"]').text()).toContain('{menu_link}')
  })

  it('pide restaurar los de fábrica en vez de hacerlo por su cuenta', async () => {
    const wrapper = mountSection({ order_received: off() })
    await wrapper.get('[data-testid="restore-mapping"]').trigger('click')
    expect(wrapper.emitted('restore')).toHaveLength(1)
  })
})
