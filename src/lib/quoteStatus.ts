// Cómo se lee, en el tablero de despacho, el estado de cotización de una entrega y el de su
// enlace de pago.
//
// Son DOS hechos distintos y la pantalla no puede fundirlos:
//
// - la cotización es dinero: sin ella el pedido no tiene precio y no puede cobrarse ni cocinarse;
// - la emisión es logística: el precio existe, pero puede que el cliente no lo haya recibido.
//
// El segundo es el que se pierde de vista. Una entrega cotizada cuyo mensaje nunca salió se ve
// exactamente igual que una cotizada y avisada, y es justo la que alguien tiene que perseguir.

import type { Delivery } from '@/services/delivery.api'

export type QuoteTone = 'ok' | 'waiting' | 'blocked'

export interface QuoteBadge {
  label: string
  tone: QuoteTone
  /** La frase larga, para el título/tooltip. Nunca sustituye a `label`. */
  detail: string | null
}

/** El estado de la COTIZACIÓN: ¿tiene precio esta entrega? */
export function quoteBadge(delivery: Delivery): QuoteBadge {
  switch (delivery.quote_status) {
    case 'quoted':
      return { label: 'Cotizado', tone: 'ok', detail: null }
    case 'outside_coverage':
      return {
        label: 'Fuera de cobertura',
        tone: 'blocked',
        detail:
          'Está más lejos que la última banda de tarifa. No se cobra domicilio y no entra a cocina.',
      }
    case 'unquotable':
      return {
        label: 'No cotizable',
        tone: 'blocked',
        detail: delivery.quote_failure_reason,
      }
    default:
      return {
        // NO "sin domicilio" ni un cero: un pendiente no es gratis, es que todavía no se sabe.
        label: 'Sin cotizar',
        tone: 'waiting',
        detail: delivery.latitude
          ? 'Esperando el cálculo del domicilio.'
          : 'Esperando la ubicación para poder calcular el domicilio.',
      }
  }
}

/** El estado del ENLACE DE PAGO, o null cuando todavía no toca hablar de él. */
export function emissionBadge(delivery: Delivery): QuoteBadge | null {
  // Sin cotización no hay enlace que mandar, y decir "no enviado" sería culpar a la mensajería
  // de algo que no ha llegado a su turno.
  if (delivery.quote_status !== 'quoted') return null
  switch (delivery.emission_status) {
    case 'sent':
      return { label: 'Enlace enviado', tone: 'ok', detail: null }
    case 'failed':
      return {
        label: 'Enlace no enviado',
        tone: 'blocked',
        detail: delivery.emission_failure_reason,
      }
    case 'no_contact':
      return {
        label: 'Sin WhatsApp',
        tone: 'waiting',
        detail:
          delivery.emission_failure_reason ??
          'Este pedido no está vinculado a un contacto de WhatsApp. Pásale el enlace a mano.',
      }
    default:
      return { label: 'Enlace pendiente', tone: 'waiting', detail: null }
  }
}

/** ¿Tiene sentido ofrecer "reenviar el enlace"? Sólo si hay algo cotizado que reemitir. */
export function canReissue(delivery: Delivery): boolean {
  return delivery.quote_status === 'quoted' && delivery.emission_status !== 'sent'
}
