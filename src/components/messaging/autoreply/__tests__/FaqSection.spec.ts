// La sección de FAQs. Lo que se prueba aquí no es que pinte tarjetas: es que el dueño pueda
// entender lo que va a pasar. Dos cosas concretas — que el reordenar sea usable con teclado (por
// eso son flechas y no drag) y que la pantalla DIGA cuándo una FAQ no contesta, porque sin eso la
// primera prueba del dueño (escribirse a sí mismo con un pedido abierto) parece un fallo.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import FaqSection from '../FaqSection.vue'
import type { FaqEntry } from '@/services/messaging.api'

const PLACEHOLDERS = ['business_name', 'branch_address', 'menu_link', 'hours_line']

const faq = (id: string, over: Partial<FaqEntry> = {}): FaqEntry => ({
  id,
  name: id,
  triggers: ['donde estan'],
  text: 'Estamos en {branch_address}.',
  enabled: true,
  ...over,
})

function mountSection(faqs: FaqEntry[], over: Record<string, unknown> = {}) {
  return mount(FaqSection, {
    props: { faqs, placeholders: PLACEHOLDERS, disabled: false, ...over },
  })
}

describe('FaqSection', () => {
  it('cuenta cuántas están encendidas y dice que gana la de arriba', () => {
    const wrapper = mountSection([faq('a'), faq('b', { enabled: false })])
    const count = wrapper.get('[data-testid="faq-count"]').text()
    expect(count).toContain('1')
    expect(count).toContain('gana la de arriba')
  })

  it('sin ninguna, lo dice en vez de dejar un hueco', () => {
    const wrapper = mountSection([])
    expect(wrapper.get('[data-testid="faq-count"]').text()).toContain('No hay ninguna')
  })

  it('enseña el puesto de cada una: el orden ES la prioridad', () => {
    const wrapper = mountSection([faq('a'), faq('b')])
    expect(wrapper.get('[data-testid="faq-position-a"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="faq-position-b"]').text()).toBe('2')
  })

  // --- Cuándo NO contesta ----------------------------------------------------
  it('explica las condiciones de silencio, incluido el pedido en curso', () => {
    const notice = mountSection([faq('a')]).get('[data-testid="faq-silence-notice"]').text()
    expect(notice).toContain('pedido en curso')
    expect(notice).toContain('hablar con una persona')
    expect(notice).toContain('primer mensaje')
  })

  it('dice que sí contestan con el negocio cerrado', () => {
    const notice = mountSection([faq('a')]).get('[data-testid="faq-silence-notice"]').text()
    expect(notice).toContain('cerrado')
  })

  // --- Reordenar -------------------------------------------------------------
  it('subir y bajar emiten la lista reordenada', async () => {
    const wrapper = mountSection([faq('a'), faq('b')])
    await wrapper.get('[data-testid="faq-down-a"]').trigger('click')
    const emitted = wrapper.emitted('update:faqs')?.[0]?.[0] as FaqEntry[]
    expect(emitted.map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('los extremos están deshabilitados', () => {
    const wrapper = mountSection([faq('a'), faq('b')])
    expect(wrapper.get('[data-testid="faq-up-a"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="faq-down-b"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="faq-down-a"]').attributes('disabled')).toBeUndefined()
  })

  it('las flechas se nombran para un lector de pantalla', () => {
    const wrapper = mountSection([faq('a', { name: 'Ubicación' }), faq('b')])
    expect(wrapper.get('[data-testid="faq-up-a"]').attributes('aria-label')).toBe(
      'Subir Ubicación',
    )
  })

  // --- Editar ----------------------------------------------------------------
  it('el nombre se edita dentro de la tarjeta, no en el header', async () => {
    const wrapper = mountSection([faq('a')])
    expect(wrapper.find('[data-testid="faq-name-a"]').exists()).toBe(false)
    await wrapper.get('[data-testid="faq-header-a"]').trigger('click')
    expect(wrapper.find('[data-testid="faq-name-a"]').exists()).toBe(true)
  })

  it('un gatillo se añade con Enter y se quita con la ×', async () => {
    const list = [faq('a', { triggers: ['donde estan'] })]
    const wrapper = mountSection(list)
    await wrapper.get('[data-testid="faq-header-a"]').trigger('click')

    const input = wrapper.get('[data-testid="faq-trigger-input-a"]')
    await input.setValue('como llego')
    await input.trigger('keydown.enter')
    expect(list[0]!.triggers).toContain('como llego')

    await wrapper.get('[data-testid="faq-trigger-remove-a-donde estan"]').trigger('click')
    expect(list[0]!.triggers).not.toContain('donde estan')
  })

  it('un gatillo repetido no se añade dos veces', async () => {
    const list = [faq('a', { triggers: ['donde estan'] })]
    const wrapper = mountSection(list)
    await wrapper.get('[data-testid="faq-header-a"]').trigger('click')
    const input = wrapper.get('[data-testid="faq-trigger-input-a"]')
    await input.setValue('donde estan')
    await input.trigger('keydown.enter')
    expect(list[0]!.triggers).toEqual(['donde estan'])
  })

  it('nombra el marcador que no existe mientras se escribe', async () => {
    const wrapper = mountSection([faq('a', { text: 'Hola {cliente}' })])
    await wrapper.get('[data-testid="faq-header-a"]').trigger('click')
    expect(wrapper.get('[data-testid="faq-unknown-a"]').text()).toContain('{cliente}')
  })

  it('explica que la coincidencia es por palabra completa', async () => {
    const wrapper = mountSection([faq('a')])
    await wrapper.get('[data-testid="faq-header-a"]').trigger('click')
    expect(wrapper.text()).toContain('ya pagué')
  })

  // --- Añadir, borrar, restaurar ---------------------------------------------
  it('agregar crea una FAQ vacía y la abre', async () => {
    const wrapper = mountSection([])
    await wrapper.get('[data-testid="faq-add"]').trigger('click')
    const emitted = wrapper.emitted('update:faqs')?.[0]?.[0] as FaqEntry[]
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.triggers).toEqual([])
  })

  it('borrar pide confirmación antes de quitarla', async () => {
    const wrapper = mountSection([faq('a')])
    await wrapper.get('[data-testid="faq-header-a"]').trigger('click')
    await wrapper.get('[data-testid="faq-delete-a"]').trigger('click')
    expect(wrapper.emitted('update:faqs')).toBeUndefined()

    await wrapper.get('[data-testid="faq-delete-confirm-a"]').trigger('click')
    expect(wrapper.emitted('update:faqs')?.[0]?.[0]).toEqual([])
  })

  it('restaurar las sugeridas pide confirmación porque descarta lo editado', async () => {
    const wrapper = mountSection([faq('a')])
    await wrapper.get('[data-testid="restore-faqs"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm-restore"]').text()).toContain('descarta')
    expect(wrapper.emitted('restore')).toBeUndefined()

    await wrapper.get('[data-testid="confirm-restore-yes"]').trigger('click')
    expect(wrapper.emitted('restore')).toHaveLength(1)
  })

  it('el interruptor de cada FAQ la enciende y apaga', async () => {
    const list = [faq('a', { enabled: false })]
    const wrapper = mountSection(list)
    await wrapper.get('[data-testid="faq-toggle-a"]').trigger('click')
    expect(list[0]!.enabled).toBe(true)
  })

  it('guardando, todo queda deshabilitado', () => {
    const wrapper = mountSection([faq('a'), faq('b')], { disabled: true })
    expect(wrapper.get('[data-testid="faq-add"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="faq-down-a"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="faq-toggle-a"]').attributes('disabled')).toBeDefined()
  })
})
