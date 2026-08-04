// La cabecera del chat: quién es, quién lo atiende y si el número está vivo.
//
// Lo último no es adorno. Si la sesión se cayó, el agente puede escribir respuestas durante diez
// minutos sin que salga ninguna — y el cliente cree que lo están ignorando.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ConversationHeader from '../ConversationHeader.vue'
import type { Thread } from '@/services/messaging.api'

const thread = (over: Partial<Thread> = {}): Thread =>
  ({
    id: 'c1',
    branch_id: 'b1',
    contact_id: 'k1',
    contact_name: 'Ana Restrepo',
    contact_phone: '573001112233',
    status: 'greeted',
    employee_id: null,
    holder_name: null,
    started_at: '2026-08-01T14:00:00Z',
    closed_at: null,
    messages: [],
    ...over,
  }) as Thread

const mountHeader = (over: Record<string, unknown> = {}) =>
  mount(ConversationHeader, {
    props: {
      thread: thread(),
      canAttend: true,
      connectionStatus: 'connected' as const,
      currentEmployeeId: 'e1',
      ...over,
    },
  })

describe('ConversationHeader', () => {
  it('el subtítulo es el teléfono formateado, no el JID', () => {
    expect(mountHeader().get('[data-testid="contact-subtitle"]').text()).toBe('+57 300 111 2233')
  })

  it('con un @lid dice por qué no hay número, y guarda el crudo en el title', () => {
    const wrapper = mountHeader({
      thread: thread({ contact_name: null, contact_phone: '196125537607835@lid' }),
    })
    const subtitle = wrapper.get('[data-testid="contact-subtitle"]')

    expect(subtitle.text()).toBe('Número oculto por el cliente')
    // Disponible para depurar, sin ocupar la jerarquía.
    expect(subtitle.attributes('title')).toBe('196125537607835@lid')
    expect(wrapper.text()).not.toContain('@lid')
  })

  // --- El estado del número --------------------------------------------------
  it('conectado se dice en gris: es lo normal, no una alarma', () => {
    const status = mountHeader().get('[data-testid="connection-status"]')
    expect(status.text()).toBe('Conectado')
    expect(status.classes()).toContain('text-steel-400')
  })

  it('desconectado se dice en alerta', () => {
    const status = mountHeader({ connectionStatus: 'disconnected' }).get(
      '[data-testid="connection-status"]',
    )
    expect(status.text()).toBe('Sin conexión')
    expect(status.classes()).toContain('text-alert')
  })

  it('reconectando late, para que se note que es transitorio', () => {
    const wrapper = mountHeader({ connectionStatus: 'reconnecting' })
    expect(wrapper.get('[data-testid="connection-status"]').text()).toBe('Reconectando')
    expect(wrapper.html()).toContain('animate-pulse')
  })

  // --- Tomar / reasignar -----------------------------------------------------
  it('sin dueño, el botón invita a tomarla', () => {
    expect(mountHeader().get('[data-testid="claim-button"]').text()).toBe('Tomar')
  })

  it('si la tiene OTRO, el botón dice que se la vas a quitar', () => {
    // "Tomar" a secas esconde que hay alguien más metido en esa conversación.
    const wrapper = mountHeader({
      thread: thread({ employee_id: 'e2', holder_name: 'Bruno Díaz' }),
    })
    expect(wrapper.get('[data-testid="claim-button"]').text()).toBe('Reasignar a mí')
    expect(wrapper.text()).toContain('atiende Bruno Díaz')
  })

  it('si ya es tuya no hay nada que tomar', () => {
    const wrapper = mountHeader({
      thread: thread({ employee_id: 'e1', holder_name: 'Ana' }),
    })
    expect(wrapper.find('[data-testid="claim-button"]').exists()).toBe(false)
  })

  it('una conversación cerrada no ofrece acciones', () => {
    const wrapper = mountHeader({ thread: thread({ status: 'closed' }) })
    expect(wrapper.find('[data-testid="claim-button"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Cerrada')
  })

  it('sin permiso de atender no se ofrece nada', () => {
    const wrapper = mountHeader({ canAttend: false })
    expect(wrapper.find('[data-testid="claim-button"]').exists()).toBe(false)
  })
})
