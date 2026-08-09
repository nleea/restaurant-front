// El interruptor de "no enviarle estados", en la cabecera del hilo.
//
// La propiedad que hace defendible la feature es lo que el interruptor NO hace, y es lo que se
// prueba aquí: vive en el hilo (donde llega la petición), lo maneja quien ATIENDE (no quien
// configura), y no cambia nada más del hilo.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConversationHeader from '@/components/messaging/ConversationHeader.vue'
import type { Thread } from '@/services/messaging.api'

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: 'c1',
    branch_id: 'b1',
    contact_id: 'k1',
    contact_name: 'Ana Restrepo',
    contact_phone: '573001112233',
    contact_status_opt_out: false,
    status: 'new',
    employee_id: null,
    holder_name: null,
    started_at: '2026-08-09T12:00:00Z',
    closed_at: null,
    messages: [],
    ...over,
  }
}

function render(over: Partial<Thread> = {}, canAttend = true) {
  return mount(ConversationHeader, {
    props: { thread: thread(over), canAttend, connectionStatus: 'connected' as const },
    global: { stubs: { RouterLink: true } },
  })
}

describe('el interruptor de estados', () => {
  it('lo ofrece quien atiende, en el hilo donde llega la petición', () => {
    const wrapper = render()
    expect(wrapper.get('[data-testid="toggle-opt-out"]').text()).toContain(
      'No enviarle estados',
    )
  })

  it('sin `messaging.attend` no se ofrece', () => {
    // El permiso es `attend` y no `manage`: pedirle un permiso de administración a quien acaba de
    // leer la petición en el chat es cómo se consigue que la petición no se cumpla.
    const wrapper = render({}, false)
    expect(wrapper.find('[data-testid="toggle-opt-out"]').exists()).toBe(false)
  })

  it('emite la marca al pulsarlo', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="toggle-opt-out"]').trigger('click')
    expect(wrapper.emitted('toggleStatusOptOut')).toEqual([[true]])
  })

  it('emite el desmarcado cuando ya estaba marcado', async () => {
    const wrapper = render({ contact_status_opt_out: true })
    await wrapper.get('[data-testid="toggle-opt-out"]').trigger('click')
    expect(wrapper.emitted('toggleStatusOptOut')).toEqual([[false]])
  })

  it('un contacto marcado lo lleva a la vista', () => {
    // Si la marca no se ve, nadie sabe que ya se cumplió la petición, y el siguiente que lea el
    // hilo la vuelve a prometer.
    const wrapper = render({ contact_status_opt_out: true })
    expect(wrapper.get('[data-testid="opt-out-mark"]').text()).toContain(
      'no recibe estados',
    )
    expect(wrapper.get('[data-testid="toggle-opt-out"]').text()).toContain(
      'Volver a enviarle',
    )
  })

  it('sin marca no pinta el aviso', () => {
    expect(render().find('[data-testid="opt-out-mark"]').exists()).toBe(false)
  })

  it('marcar no es un bloqueo: el hilo sigue igual de atendible', () => {
    // El opt-out es de ESTADOS, no del canal. Si esto se rompiera, una petición razonable ("no me
    // manden promociones") habría cortado la atención.
    const marked = render({ contact_status_opt_out: true })
    const plain = render()
    expect(marked.get('[data-testid="contact-subtitle"]').text()).toBe(
      plain.get('[data-testid="contact-subtitle"]').text(),
    )
    expect(marked.get('[data-testid="connection-status"]').text()).toBe(
      plain.get('[data-testid="connection-status"]').text(),
    )
  })
})
