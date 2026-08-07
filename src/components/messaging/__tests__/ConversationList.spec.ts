import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ConversationList from '../ConversationList.vue'
import type { Conversation } from '@/services/messaging.api'

function conversation(over: Partial<Conversation> & { id: string }): Conversation {
  return {
    branch_id: 'b1',
    contact_id: `k-${over.id}`,
    contact_name: null,
    contact_phone: '+573001112233',
    status: 'new',
    employee_id: null,
    holder_name: null,
    started_at: '2026-07-30T10:00:00Z',
    closed_at: null,
    last_message_at: '2026-07-30T10:00:00Z',
    last_message_preview: 'Hola',
    last_message_sender_type: 'contact',
    message_count: 1,
    awaiting_reply: false,
    ...over,
  }
}

const mountList = (
  conversations: Conversation[],
  selectedId: string | null = null,
  currentEmployeeId: string | null = null,
) =>
  mount(ConversationList, {
    props: { conversations, selectedId, loading: false, currentEmployeeId },
  })

describe('ConversationList', () => {
  it('leads with the people still waiting on us', () => {
    const wrapper = mountList([
      conversation({ id: 'answered', contact_name: 'Ana', awaiting_reply: false }),
      conversation({ id: 'waiting', contact_name: 'Bruno', awaiting_reply: true }),
    ])
    const order = wrapper.findAll('[data-conversation]').map((b) => b.attributes('data-conversation'))
    expect(order).toEqual(['waiting', 'answered'])
    // La espera ya no se dice con una etiqueta: se ve en el filo de calor y en cuánto lleva.
    expect(wrapper.text()).toContain('esperando')
    expect(wrapper.find('[data-heat="waiting"]').attributes('style')).not.toContain('opacity: 0;')
    // Y quien no espera no quema.
    expect(wrapper.find('[data-heat="answered"]').attributes('style')).toContain('opacity: 0')
  })

  it('shows the holder when taken and flags it when not', () => {
    const wrapper = mountList([
      conversation({ id: 'c1', holder_name: 'Ana Restrepo', employee_id: 'e1' }),
      conversation({ id: 'c2' }),
    ])
    expect(wrapper.text()).toContain('Ana Restrepo')
    expect(wrapper.text()).toContain('Sin tomar')
  })

  it('falls back to the phone number when the contact has no name', () => {
    const wrapper = mountList([conversation({ id: 'c1' })])
    // Formateado para leerlo en voz alta, no la cadena cruda de la base.
    expect(wrapper.text()).toContain('+57 300 111 2233')
  })

  it('emits the conversation that was tapped', async () => {
    const c = conversation({ id: 'c1', contact_name: 'Ana' })
    const wrapper = mountList([c])
    await wrapper.get('[data-conversation="c1"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([c])
  })

  it('invites action instead of showing a blank panel', () => {
    expect(mountList([]).text()).toContain('Nadie ha escrito a esta sucursal todavía')
  })

  it('marks the selected conversation', () => {
    const wrapper = mountList([conversation({ id: 'c1' })], 'c1')
    // La selección es una superficie, no un borde: la cola es un carril continuo y rodear cada
    // fila de su propia caja convierte una lista de personas esperando en un formulario.
    expect(wrapper.get('[data-conversation="c1"]').classes()).toContain('bg-sunken')
  })

  // --- Buscar y filtrar ------------------------------------------------------
  it('busca por nombre y por número', async () => {
    const wrapper = mountList([
      conversation({ id: 'ana', contact_name: 'Ana Restrepo' }),
      conversation({ id: 'bruno', contact_name: 'Bruno Díaz' }),
    ])

    await wrapper.get('[data-testid="conversation-search"]').setValue('ana')

    expect(wrapper.find('[data-conversation="ana"]').exists()).toBe(true)
    expect(wrapper.find('[data-conversation="bruno"]').exists()).toBe(false)
  })

  it('sin coincidencias dice qué se buscó, no "sin resultados"', async () => {
    const wrapper = mountList([conversation({ id: 'ana', contact_name: 'Ana' })])
    await wrapper.get('[data-testid="conversation-search"]').setValue('zzz')
    expect(wrapper.get('[data-testid="list-empty"]').text()).toContain('zzz')
  })

  it('los filtros separan sin tomar, mías y cerradas', async () => {
    const wrapper = mountList(
      [
        conversation({ id: 'libre' }),
        conversation({ id: 'mia', employee_id: 'e1', holder_name: 'Ana' }),
        conversation({ id: 'ajena', employee_id: 'e2', holder_name: 'Bruno' }),
        conversation({ id: 'cerrada', status: 'closed' }),
      ],
      null,
      'e1',
    )

    await wrapper.get('[data-filter="unclaimed"]').trigger('click')
    expect(wrapper.findAll('[data-conversation]').map((b) => b.attributes('data-conversation'))).toEqual(['libre'])

    await wrapper.get('[data-filter="mine"]').trigger('click')
    expect(wrapper.findAll('[data-conversation]').map((b) => b.attributes('data-conversation'))).toEqual(['mia'])

    await wrapper.get('[data-filter="closed"]').trigger('click')
    expect(wrapper.findAll('[data-conversation]').map((b) => b.attributes('data-conversation'))).toEqual(['cerrada'])
  })

  it('los contadores cuentan sobre lo buscado, o mentirían', async () => {
    const wrapper = mountList([
      conversation({ id: 'ana', contact_name: 'Ana' }),
      conversation({ id: 'bruno', contact_name: 'Bruno' }),
    ])
    expect(wrapper.get('[data-filter="all"]').text()).toContain('2')

    await wrapper.get('[data-testid="conversation-search"]').setValue('ana')

    expect(wrapper.get('[data-filter="all"]').text()).toContain('1')
  })

  it('un filtro vacío explica ese filtro, no la pantalla entera', async () => {
    const wrapper = mountList([conversation({ id: 'libre' })])
    await wrapper.get('[data-filter="mine"]').trigger('click')
    expect(wrapper.get('[data-testid="list-empty"]').text()).toContain('No tienes ninguna')
  })

  it('un @lid no se cuela como nombre en la lista', () => {
    const wrapper = mountList([
      conversation({ id: 'c1', contact_name: null, contact_phone: '196125537607835@lid' }),
    ])
    expect(wrapper.text()).not.toContain('@lid')
    expect(wrapper.text()).toContain('Sin nombre')
  })
})

