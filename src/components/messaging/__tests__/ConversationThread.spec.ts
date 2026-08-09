import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ConversationThread from '../ConversationThread.vue'
import type { Message, Thread } from '@/services/messaging.api'

function message(over: Partial<Message> & { id: string }): Message {
  return {
    sender_type: 'contact',
    employee_id: null,
    content: 'Hola',
    delivery_state: 'sent',
    sent_at: '2026-07-30T15:00:00Z',
    media_type: null,
    media_mime: null,
    media_url: null,
    proof_of_order: null,
    ...over,
  }
}

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: 'c1',
    branch_id: 'b1',
    contact_id: 'k1',
    contact_name: 'Ana Restrepo',
    contact_phone: '+573001112233',
    contact_status_opt_out: false,
    status: 'new',
    employee_id: null,
    holder_name: null,
    started_at: '2026-07-30T15:00:00Z',
    closed_at: null,
    messages: [],
    ...over,
  }
}

const BASE = {
  canAttend: true,
  sending: false,
  replyError: null,
  claimConflictHolder: null,
  hasClaimConflict: false,
  connectionStatus: 'connected' as const,
}

const mountThread = (over: Record<string, unknown> = {}) =>
  mount(ConversationThread, { props: { thread: thread(), ...BASE, ...over } })

describe('ConversationThread', () => {
  it('renders both sides in order and tells them apart', () => {
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({ id: 'm1', content: '¿Tienen domicilio?' }),
          message({
            id: 'm2',
            sender_type: 'employee',
            employee_id: 'e1',
            content: 'Sí, claro',
            sent_at: '2026-07-30T15:01:00Z',
          }),
        ],
      }),
    })

    const rows = wrapper.findAll('[data-message]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.classes()).toContain('justify-start')
    expect(rows[1]!.classes()).toContain('justify-end')
    expect(wrapper.text()).toContain('¿Tienen domicilio?')
    expect(wrapper.text()).toContain('Sí, claro')
  })

  it('renders a system message as neither side', () => {
    const wrapper = mountThread({
      thread: thread({
        messages: [message({ id: 'm1', sender_type: 'system', content: 'Conversación abierta' })],
      }),
    })
    // Un automático va a la DERECHA, con los del negocio: el cliente lo recibió como un mensaje
    // suyo. Antes era una pastilla centrada, o sea cromo del sistema — y eso mentía sobre lo que
    // pasó en el chat. Se distingue por el relleno (vacío) y por la etiqueta.
    expect(wrapper.get('[data-message]').classes()).toContain('justify-end')
    expect(wrapper.get('[data-message]').attributes('data-kind')).toBe('automatic')
    expect(wrapper.get('[data-testid="automatic-tag"]').text()).toBe('Automático')
  })

  it('marks a reply that did not land', () => {
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({
            id: 'm1',
            sender_type: 'employee',
            content: 'no salió',
            delivery_state: 'failed',
          }),
        ],
      }),
    })
    expect(wrapper.find('[data-failed]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No enviado')
  })

  it('explains a lost claim rather than failing silently', () => {
    const wrapper = mountThread({ hasClaimConflict: true, claimConflictHolder: 'Bruno Díaz' })
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('Bruno Díaz')
    expect(alert.text()).toContain('ya la tomó')
  })

  it('offers Tomar only while the conversation is unclaimed', async () => {
    const unclaimed = mountThread()
    expect(unclaimed.text()).toContain('Tomar')
    await unclaimed.get('button').trigger('click')

    const claimed = mountThread({
      thread: thread({ employee_id: 'e1', holder_name: 'Ana Restrepo', status: 'human' }),
    })
    expect(claimed.text()).not.toContain('Tomar')
    expect(claimed.text()).toContain('atiende Ana Restrepo')
  })

  it('envía la respuesta y limpia el borrador cuando el envío TERMINA', async () => {
    const wrapper = mountThread()
    const box = wrapper.get('textarea')
    await box.setValue('Vamos para allá')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('reply')?.[0]).toEqual(['Vamos para allá'])
    // Todavía escrito: el envío está en marcha y nadie ha confirmado nada.
    expect((box.element as HTMLTextAreaElement).value).toBe('Vamos para allá')

    await wrapper.setProps({ sending: true })
    await wrapper.setProps({ sending: false })

    expect((box.element as HTMLTextAreaElement).value).toBe('')
  })

  it('si el envío falla, el texto NO se pierde', async () => {
    // Un agente que escribe cuatro líneas y las pierde por un puente caído no vuelve a confiar
    // en la pantalla. Se limpia sólo cuando el envío salió limpio.
    const wrapper = mountThread()
    const box = wrapper.get('textarea')
    await box.setValue('Vamos para allá')
    await wrapper.get('form').trigger('submit')

    await wrapper.setProps({ sending: true })
    await wrapper.setProps({ sending: false, replyError: 'No se pudo enviar el mensaje.' })

    expect((box.element as HTMLTextAreaElement).value).toBe('Vamos para allá')
    expect(wrapper.get('[data-testid="composer-error"]').text()).toContain('sigue escrito')
  })

  it('will not send an empty or whitespace-only reply', async () => {
    const wrapper = mountThread()
    await wrapper.get('textarea').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('reply')).toBeUndefined()
  })

  it('a read-only user reads the thread but cannot act on it', () => {
    const wrapper = mountThread({
      canAttend: false,
      thread: thread({ messages: [message({ id: 'm1', content: 'Hola' })] }),
    })

    expect(wrapper.text()).toContain('Hola')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Tomar')
    expect(wrapper.text()).not.toContain('Cerrar')
    expect(wrapper.text()).toContain('no tienes permiso para responder')
  })

  it('a closed conversation cannot be replied to', () => {
    const wrapper = mountThread({ thread: thread({ status: 'closed' }) })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('Cerrada')
    expect(wrapper.text()).toContain('La conversación está cerrada')
  })

  // --- Multimedia entrante ---------------------------------------------------
  it('una imagen se ve en el hilo, a un tamaño en el que se lee un comprobante', () => {
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({
            id: 'm1',
            content: '[imagen]',
            media_type: 'image',
            media_mime: 'image/jpeg',
            media_url: 'https://cdn.test/foto.jpg',
          }),
        ],
      }),
    })

    const link = wrapper.get('[data-media="m1"]')
    expect(link.attributes('href')).toBe('https://cdn.test/foto.jpg')
    expect(link.get('img').attributes('src')).toBe('https://cdn.test/foto.jpg')
  })

  it('un PDF se ofrece como enlace, no incrustado', () => {
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({
            id: 'm1',
            content: '[documento]',
            media_type: 'document',
            media_mime: 'application/pdf',
            media_url: 'https://cdn.test/comprobante.pdf',
          }),
        ],
      }),
    })

    const link = wrapper.get('[data-media="m1"]')
    expect(link.attributes('href')).toBe('https://cdn.test/comprobante.pdf')
    expect(link.find('img').exists()).toBe(false)
    expect(link.text()).toContain('Abrir el archivo')
  })

  it('el pie de foto se lee como el mensaje, con la imagen encima', () => {
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({
            id: 'm1',
            content: 'aquí va mi comprobante del pedido A3F2',
            media_type: 'image',
            media_url: 'https://cdn.test/foto.jpg',
          }),
        ],
      }),
    })

    expect(wrapper.text()).toContain('aquí va mi comprobante del pedido A3F2')
    expect(wrapper.find('[data-media="m1"]').exists()).toBe(true)
  })

  it('un archivo que no se pudo traer se dice con palabras, sin imagen rota', () => {
    // Una imagen rota parece un fallo de la app; el fallo fue del puente y hay que decirlo.
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({ id: 'm1', content: '[imagen]', media_type: 'image', media_url: null }),
        ],
      }),
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[data-media-missing="m1"]').text()).toContain('no se pudo traer')
  })

  it('un mensaje de texto no pinta nada de multimedia', () => {
    const wrapper = mountThread({
      thread: thread({ messages: [message({ id: 'm1', content: 'Hola' })] }),
    })

    expect(wrapper.find('[data-media="m1"]').exists()).toBe(false)
    expect(wrapper.find('[data-media-missing="m1"]').exists()).toBe(false)
  })

  // --- Usar un archivo como comprobante --------------------------------------
  const withMedia = () =>
    thread({
      messages: [
        message({ id: 'm1', content: '[imagen]', media_type: 'image', media_url: 'https://cdn/f.jpg' }),
      ],
    })
  const ORDERS = [{ order_id: 'o1', number: 'A3F2', total: '46000', balance: '46000' }]

  it('con permiso de cobrar y un pedido debiendo, se ofrece', () => {
    const wrapper = mountThread({ thread: withMedia(), canPay: true, eligibleOrders: ORDERS })
    expect(wrapper.find('[data-use-as-proof="m1"]').exists()).toBe(true)
  })

  it('sin permiso de cobrar la acción está OCULTA, no deshabilitada', () => {
    // Un botón que da 403 al pulsarlo enseña a la gente a ignorar los botones.
    const wrapper = mountThread({ thread: withMedia(), canPay: false, eligibleOrders: ORDERS })
    expect(wrapper.find('[data-use-as-proof="m1"]').exists()).toBe(false)
  })

  it('sin pedidos debiendo tampoco se ofrece', () => {
    const wrapper = mountThread({ thread: withMedia(), canPay: true, eligibleOrders: [] })
    expect(wrapper.find('[data-use-as-proof="m1"]').exists()).toBe(false)
  })

  it('un mensaje sin archivo nunca la ofrece', () => {
    const wrapper = mountThread({
      thread: thread({ messages: [message({ id: 'm1', content: 'Hola' })] }),
      canPay: true,
      eligibleOrders: ORDERS,
    })
    expect(wrapper.find('[data-use-as-proof="m1"]').exists()).toBe(false)
  })

  it('elegir un pedido emite el id y el SALDO, no el total', async () => {
    const wrapper = mountThread({
      thread: withMedia(),
      canPay: true,
      eligibleOrders: [{ order_id: 'o1', number: 'A3F2', total: '46000', balance: '2500' }],
    })

    await wrapper.get('[data-use-as-proof="m1"]').trigger('click')
    await wrapper.get('[data-confirm-proof="m1"]').trigger('click')

    expect(wrapper.emitted('useAsProof')?.[0]).toEqual(['m1', 'o1', '2500'])
  })

  it('el selector nombra el pedido y lo que falta', async () => {
    const wrapper = mountThread({ thread: withMedia(), canPay: true, eligibleOrders: ORDERS })
    await wrapper.get('[data-use-as-proof="m1"]').trigger('click')
    expect(wrapper.get('[data-proof-picker="m1"]').text()).toContain('A3F2')
    expect(wrapper.get('[data-proof-picker="m1"]').text()).toContain('falta')
  })

  it('un archivo ya usado lo dice, nombrando el pedido', () => {
    // Sin esto, dos personas pegan la misma foto a dos pedidos y el mismo recibo cuenta dos veces.
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({
            id: 'm1',
            media_type: 'image',
            media_url: 'https://cdn/f.jpg',
            proof_of_order: 'A3F2',
          }),
        ],
      }),
      canPay: true,
      eligibleOrders: ORDERS,
    })

    expect(wrapper.get('[data-proof-used="m1"]').text()).toContain('A3F2')
    // Y ya no se ofrece volver a usarlo.
    expect(wrapper.find('[data-use-as-proof="m1"]').exists()).toBe(false)
  })

  it('sin pedidos por cobrar dice POR QUÉ, en vez de dejar un hueco', () => {
    // Un hueco donde debería haber un botón se lee como que la app está rota.
    const wrapper = mountThread({ thread: withMedia(), canPay: true, eligibleOrders: [] })
    expect(wrapper.get('[data-no-eligible="m1"]').text()).toContain('no tiene pedidos por cobrar')
  })

  it('sin permiso de cobrar no se explica nada: no es asunto suyo', () => {
    const wrapper = mountThread({ thread: withMedia(), canPay: false, eligibleOrders: [] })
    expect(wrapper.find('[data-no-eligible="m1"]').exists()).toBe(false)
  })

  // --- Adjuntar un archivo ---------------------------------------------------
  const pickFile = async (wrapper: ReturnType<typeof mountThread>, name = 'foto.png') => {
    const file = new File(['x'], name, { type: 'image/png' })
    const input = wrapper.get('[data-testid="composer-file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    return file
  }

  it('el adjunto se VE antes de salir', async () => {
    // Un adjunto invisible es un adjunto que se manda por accidente.
    const wrapper = mountThread()
    await pickFile(wrapper, 'comprobante.png')
    expect(wrapper.get('[data-testid="composer-attachment"]').text()).toContain('comprobante.png')
  })

  it('se puede quitar antes de mandarlo', async () => {
    const wrapper = mountThread()
    await pickFile(wrapper)
    await wrapper.get('[data-testid="composer-detach"]').trigger('click')
    expect(wrapper.find('[data-testid="composer-attachment"]').exists()).toBe(false)
  })

  it('el texto viaja como pie, en un solo mensaje', async () => {
    // Mandarlos por separado le llegarían desordenados al cliente.
    const wrapper = mountThread()
    await pickFile(wrapper)
    await wrapper.get('textarea').setValue('Aquí tienes')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('sendFile')?.[0]?.[1]).toBe('Aquí tienes')
    expect(wrapper.emitted('reply')).toBeUndefined()
  })

  it('con archivo se puede enviar sin escribir nada', async () => {
    const wrapper = mountThread()
    await pickFile(wrapper)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('sendFile')).toHaveLength(1)
  })

  it('desconectado no se puede adjuntar', async () => {
    const wrapper = mountThread({ connectionStatus: 'disconnected' })
    expect(
      wrapper.get('[data-testid="composer-attach"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('el adjunto sobrevive a un envío fallido', async () => {
    const wrapper = mountThread()
    await pickFile(wrapper, 'comprobante.png')
    await wrapper.get('form').trigger('submit')

    await wrapper.setProps({ sending: true })
    await wrapper.setProps({ sending: false, replyError: 'No se pudo mandar el archivo.' })

    expect(wrapper.get('[data-testid="composer-attachment"]').text()).toContain('comprobante.png')
  })
})


// --- Respuestas rápidas ------------------------------------------------------
// La propiedad que permite poner el botón junto al de enviar: **insertan, no envían**. Un toque
// equivocado no le llega a nadie. La segunda, igual de importante: no pisan el borrador.
const QUICK = [
  { id: 'q1', name: 'Va en camino', text: 'Tu pedido ya salió.' },
  { id: 'q2', name: 'Gracias', text: '¡Gracias por tu compra!' },
]

describe('respuestas rápidas en el compositor', () => {
  it('sin plantillas no se pinta el botón: un menú vacío es peor que ninguno', () => {
    const wrapper = mountThread()
    expect(wrapper.find('[data-testid="quick-reply-trigger"]').exists()).toBe(false)
  })

  it('con el número desconectado no aparece, como el resto del compositor', () => {
    const wrapper = mountThread({ quickReplies: QUICK, connectionStatus: 'disconnected' })
    expect(wrapper.find('[data-testid="quick-reply-trigger"]').exists()).toBe(false)
  })

  it('sin permiso para atender tampoco aparece', () => {
    const wrapper = mountThread({ quickReplies: QUICK, canAttend: false })
    expect(wrapper.find('[data-testid="quick-reply-trigger"]').exists()).toBe(false)
  })

  it('en una conversación cerrada tampoco', () => {
    const wrapper = mountThread({ quickReplies: QUICK, thread: thread({ status: 'closed' }) })
    expect(wrapper.find('[data-testid="quick-reply-trigger"]').exists()).toBe(false)
  })

  it('lista las plantillas por nombre al abrirlo', async () => {
    const wrapper = mountThread({ quickReplies: QUICK })
    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    const list = wrapper.get('[data-testid="quick-reply-list"]').text()
    expect(list).toContain('Va en camino')
    expect(list).toContain('Gracias')
  })

  it('elegir una NO envía nada: el envío sigue siendo un acto aparte', async () => {
    const wrapper = mountThread({ quickReplies: QUICK })
    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-q1"]').trigger('click')

    expect(wrapper.emitted('reply')).toBeUndefined()
    const input = wrapper.get('[data-testid="composer-input"]')
      .element as HTMLTextAreaElement
    expect(input.value).toBe('Tu pedido ya salió.')
  })

  it('no pisa lo que el agente ya había escrito', async () => {
    const wrapper = mountThread({ quickReplies: QUICK })
    const input = wrapper.get('[data-testid="composer-input"]')
    await input.setValue('Hola Ana')

    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-q1"]').trigger('click')

    expect((input.element as HTMLTextAreaElement).value).toBe('Hola Ana Tu pedido ya salió.')
  })

  it('dos seguidas se concatenan en vez de reemplazarse', async () => {
    const wrapper = mountThread({ quickReplies: QUICK })
    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-q1"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-q2"]').trigger('click')

    const input = wrapper.get('[data-testid="composer-input"]')
      .element as HTMLTextAreaElement
    expect(input.value).toBe('Tu pedido ya salió. ¡Gracias por tu compra!')
  })

  it('elegir una cierra el menú', async () => {
    const wrapper = mountThread({ quickReplies: QUICK })
    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-q1"]').trigger('click')
    expect(wrapper.find('[data-testid="quick-reply-list"]').exists()).toBe(false)
  })

  it('un clic fuera lo cierra sin insertar nada', async () => {
    const wrapper = mountThread({ quickReplies: QUICK })
    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-backdrop"]').trigger('click')

    expect(wrapper.find('[data-testid="quick-reply-list"]').exists()).toBe(false)
    const input = wrapper.get('[data-testid="composer-input"]')
      .element as HTMLTextAreaElement
    expect(input.value).toBe('')
  })

  it('Escape lo cierra', async () => {
    const wrapper = mountThread({ quickReplies: QUICK })
    await wrapper.get('[data-testid="quick-reply-trigger"]').trigger('click')
    await wrapper.get('[data-testid="quick-reply-list"]').trigger('keydown.escape')
    expect(wrapper.find('[data-testid="quick-reply-list"]').exists()).toBe(false)
  })
})

// --- Acuses de entrega (✓✓) --------------------------------------------------
// Lo que se prueba: que los cuatro estados se distingan, que el mensaje del cliente NO lleve
// acuse (nadie enseña "leído" sobre el mensaje de otro) y que el color no sea la única
// diferencia — hay `aria-label` en palabras para el lector de pantalla y para el sol.
describe('acuses de entrega', () => {
  const outbound = (delivery_state: Message['delivery_state']) =>
    mountThread({
      thread: thread({
        messages: [
          message({ id: 'm1', sender_type: 'employee', content: 'Ya salió', delivery_state }),
        ],
      }),
    })

  it('un mensaje sin acuse todavía se lee como enviado, no como fallido', () => {
    const wrapper = outbound('sent')
    expect(wrapper.find('[data-testid="receipt-sent"]').exists()).toBe(true)
    expect(wrapper.find('[data-failed]').exists()).toBe(false)
  })

  it('entregado y leído se distinguen entre sí y de enviado', () => {
    const delivered = outbound('delivered')
    const read = outbound('read')

    expect(delivered.find('[data-testid="receipt-delivered"]').exists()).toBe(true)
    expect(delivered.find('[data-testid="receipt-read"]').exists()).toBe(false)
    expect(read.find('[data-testid="receipt-read"]').exists()).toBe(true)
    expect(read.find('[data-testid="receipt-sent"]').exists()).toBe(false)
  })

  it('el leído usa el acento de la casa, no el azul de otra marca', () => {
    const classes = outbound('read').get('[data-testid="receipt-read"]').classes()
    expect(classes.join(' ')).toContain('ember')
  })

  it('cada estado se dice en palabras, así que el color no es la única diferencia', () => {
    expect(outbound('sent').get('[data-testid="receipt-sent"]').attributes('aria-label')).toBe(
      'Enviado',
    )
    expect(
      outbound('delivered').get('[data-testid="receipt-delivered"]').attributes('aria-label'),
    ).toBe('Entregado')
    expect(outbound('read').get('[data-testid="receipt-read"]').attributes('aria-label')).toBe(
      'Leído',
    )
  })

  it('fallido sigue siendo inconfundible y no lleva palomita', () => {
    const wrapper = outbound('failed')
    expect(wrapper.find('[data-failed]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="receipt-sent"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="receipt-delivered"]').exists()).toBe(false)
  })

  it('el mensaje del cliente no lleva acuse ninguno', () => {
    const wrapper = mountThread({
      thread: thread({
        messages: [
          message({ id: 'm1', sender_type: 'contact', content: '¿ya salió?', delivery_state: 'read' }),
        ],
      }),
    })
    expect(wrapper.find('[data-testid="receipt-read"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="receipt-sent"]').exists()).toBe(false)
  })
})
