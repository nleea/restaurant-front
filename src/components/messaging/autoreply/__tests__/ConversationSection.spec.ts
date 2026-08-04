// El saludo NUNCA debe ofrecer algo que no vaya a responder: si el negocio no tiene asistente,
// el interruptor no se puede encender, y la pantalla dice por qué en vez de quedarse gris.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ConversationSection from '../ConversationSection.vue'

/** El último valor emitido: los `input` emiten uno por tecla y sólo importa dónde acaba. */
function last(emitted: unknown[][] | undefined): unknown[] | undefined {
  return emitted?.[emitted.length - 1]
}

function mountSection(over: Record<string, unknown> = {}) {
  return mount(ConversationSection, {
    props: {
      idleHours: 24,
      tokenHours: 24,
      assistantOffer: false,
      assistantAvailable: false,
      disabled: false,
      ...over,
    },
  })
}

describe('ConversationSection', () => {
  it('deshabilita la oferta del asistente cuando el negocio no lo tiene', () => {
    const wrapper = mountSection()
    const toggle = wrapper.get('[data-testid="assistant-toggle"]')
    expect(toggle.attributes('disabled')).toBeDefined()
  })

  it('explica por qué, en vez de dejar un interruptor mudo', () => {
    const wrapper = mountSection()
    expect(wrapper.text()).toContain('no tiene asistente conversacional')
  })

  it('un clic sin asistente no enciende nada', async () => {
    const wrapper = mountSection()
    await wrapper.get('[data-testid="assistant-toggle"]').trigger('click')
    expect(wrapper.emitted('update:assistantOffer')).toBeUndefined()
  })

  it('con asistente, la oferta se puede encender', async () => {
    const wrapper = mountSection({ assistantAvailable: true })
    const toggle = wrapper.get('[data-testid="assistant-toggle"]')
    expect(toggle.attributes('disabled')).toBeUndefined()

    await toggle.trigger('click')
    expect(wrapper.emitted('update:assistantOffer')?.[0]).toEqual([true])
  })

  it('explica que la ventana de inactividad es lo que decide volver a saludar', () => {
    const wrapper = mountSection()
    expect(wrapper.text()).toContain('vuelve a recibir el saludo')
  })

  it('emite la ventana de inactividad editada', async () => {
    const wrapper = mountSection()
    const input = wrapper.get('[data-testid="idle-hours"]')
    await input.setValue('6')
    expect(last(wrapper.emitted('update:idleHours'))).toEqual([6])
  })

  it('recorta un valor fuera de rango en vez de mandar basura al backend', async () => {
    const wrapper = mountSection()
    await wrapper.get('[data-testid="token-hours"]').setValue('9999')
    expect(last(wrapper.emitted('update:tokenHours'))).toEqual([720])

    await wrapper.get('[data-testid="token-hours"]').setValue('0')
    expect(last(wrapper.emitted('update:tokenHours'))).toEqual([1])
  })

  it('dice que los enlaces ya enviados conservan su vida', () => {
    const wrapper = mountSection()
    expect(wrapper.text()).toContain('conservan la vida que tenían')
  })
})
