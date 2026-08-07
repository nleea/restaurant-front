// La sección de respuestas rápidas. Lo que se prueba no es que pinte tarjetas: es que el dueño
// no las confunda con las FAQs de la misma pantalla (son la única sección que NO contesta sola),
// y que adoptar las sugeridas no guarde nada por su cuenta.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import QuickReplySection from '../QuickReplySection.vue'
import { MAX_QUICK_REPLY_CHARS } from '@/lib/quickReplies'
import type { QuickReply } from '@/services/messaging.api'

const SUGGESTED: QuickReply[] = [
  { id: 'sug-1', name: 'Va en camino', text: 'Tu pedido ya salió.' },
  { id: 'sug-2', name: 'Gracias', text: '¡Gracias por tu compra!' },
]

const entry = (id: string, over: Partial<QuickReply> = {}): QuickReply => ({
  id,
  name: id,
  text: 'Tu pedido ya salió.',
  ...over,
})

/** Lo último emitido en `update:entries`. `.at()` no está en el `lib` de este tsconfig. */
function lastEntries(wrapper: ReturnType<typeof mountSection>): QuickReply[] | undefined {
  const events = wrapper.emitted('update:entries')
  if (!events || events.length === 0) return undefined
  return events[events.length - 1]![0] as QuickReply[]
}

function mountSection(entries: QuickReply[], over: Record<string, unknown> = {}) {
  return mount(QuickReplySection, {
    props: { entries, suggested: SUGGESTED, disabled: false, ...over },
  })
}

describe('QuickReplySection', () => {
  it('dice que estas NO contestan solas, que es lo que las separa de las FAQs', () => {
    const notice = mountSection([]).get('[data-testid="quick-reply-notice"]').text()
    expect(notice).toContain('no contestan solas')
  })

  it('sin ninguna, lo dice en vez de dejar un hueco', () => {
    const wrapper = mountSection([])
    expect(wrapper.get('[data-testid="quick-reply-count"]').text()).toContain('No hay ninguna')
  })

  it('cuenta las que hay y dice que el orden es el del chat', () => {
    const text = mountSection([entry('a'), entry('b')])
      .get('[data-testid="quick-reply-count"]')
      .text()
    expect(text).toContain('2')
    expect(text).toContain('en este mismo orden')
  })

  it('agrega una plantilla vacía y la abre para escribirla', async () => {
    const wrapper = mountSection([])
    await wrapper.get('[data-testid="quick-reply-add"]').trigger('click')
    const emitted = lastEntries(wrapper) as QuickReply[]
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.text).toBe('')
  })

  it('elimina tras confirmar, no al primer toque', async () => {
    const wrapper = mountSection([entry('a')])
    await wrapper.get('[data-testid="quick-reply-header-a"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-delete-a"]').trigger('click')
    expect(wrapper.emitted('update:entries')).toBeUndefined()

    await wrapper.get('[data-testid="quick-reply-delete-confirm-a"]').trigger('click')
    expect(lastEntries(wrapper)).toEqual([])
  })

  it('reordena con flechas, que funcionan con teclado y con el pulgar', async () => {
    const wrapper = mountSection([entry('a'), entry('b')])
    await wrapper.get('[data-testid="quick-reply-up-b"]').trigger('click')
    const emitted = lastEntries(wrapper) as QuickReply[]
    expect(emitted.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('la primera no se puede subir ni la última bajar', () => {
    const wrapper = mountSection([entry('a'), entry('b')])
    expect(wrapper.get('[data-testid="quick-reply-up-a"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="quick-reply-down-b"]').attributes('disabled')).toBeDefined()
  })

  it('enseña el puesto, para que se vea que el orden importa', () => {
    const wrapper = mountSection([entry('a'), entry('b')])
    expect(wrapper.get('[data-testid="quick-reply-position-b"]').text()).toBe('2')
  })

  describe('sugeridas', () => {
    it('se ofrecen sólo cuando no hay nada escrito', () => {
      expect(mountSection([]).find('[data-testid="adopt-suggested"]').exists()).toBe(true)
      // Con algo escrito el botón desaparece: sería un botón que borra trabajo.
      expect(mountSection([entry('a')]).find('[data-testid="adopt-suggested"]').exists()).toBe(
        false,
      )
    })

    it('adoptar rellena el formulario y avisa de que no guarda', async () => {
      const wrapper = mountSection([])
      await wrapper.get('[data-testid="adopt-suggested"]').trigger('click')
      expect(wrapper.get('[data-testid="confirm-adopt"]').text()).toContain('No se guardan')

      await wrapper.get('[data-testid="confirm-adopt-yes"]').trigger('click')
      expect(lastEntries(wrapper)).toEqual(SUGGESTED)
    })

    it('adoptar copia: editar lo adoptado no toca las sugeridas del backend', async () => {
      const wrapper = mountSection([])
      await wrapper.get('[data-testid="adopt-suggested"]').trigger('click')
      await wrapper.get('[data-testid="confirm-adopt-yes"]').trigger('click')
      const emitted = lastEntries(wrapper) as QuickReply[]
      emitted[0]!.name = 'Cambiada'
      expect(SUGGESTED[0]!.name).toBe('Va en camino')
    })
  })

  describe('validación', () => {
    it('un marcador se avisa en la tarjeta, no sólo al guardar', async () => {
      const wrapper = mountSection([entry('a', { text: 'Pide aquí {menu_link}' })])
      await wrapper.get('[data-testid="quick-reply-header-a"]').trigger('click')
      const alert = wrapper.get('[data-testid="quick-reply-markers-a"]').text()
      expect(alert).toContain('{menu_link}')
      expect(alert).toContain('no rellenan marcadores')
    })

    it('el marcador aparece también en la lista de problemas que apaga el guardado', () => {
      const wrapper = mountSection([entry('a', { text: '{link}' })])
      expect(wrapper.get('[data-testid="quick-reply-problems"]').text()).toContain('{link}')
    })

    it('cuenta caracteres y lo marca al pasarse', async () => {
      const wrapper = mountSection([entry('a', { text: 'x'.repeat(MAX_QUICK_REPLY_CHARS + 1) })])
      await wrapper.get('[data-testid="quick-reply-header-a"]').trigger('click')
      expect(wrapper.get('[data-testid="quick-reply-chars-a"]').classes()).toContain('text-alert')
    })

    it('sin problemas no pinta la lista de problemas', () => {
      expect(mountSection([entry('a')]).find('[data-testid="quick-reply-problems"]').exists()).toBe(
        false,
      )
    })
  })
})
