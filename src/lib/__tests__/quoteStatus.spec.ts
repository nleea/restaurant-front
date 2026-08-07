// Cómo lee el despachador el estado de una entrega. El fallo que importa no es de estilo: es que
// una entrega cotizada cuyo enlace nunca salió se vea igual que una avisada — nadie la persigue,
// y el cliente nunca sabe cuánto debe.
import { describe, expect, it } from 'vitest'
import { canReissue, emissionBadge, quoteBadge } from '@/lib/quoteStatus'
import type { Delivery } from '@/services/delivery.api'

const delivery = (over: Partial<Delivery> = {}): Delivery =>
  ({
    id: 'd1',
    order_id: 'o1',
    delivery_route_id: null,
    delivery_run_id: null,
    address_text: 'Calle 1',
    neighborhood: null,
    latitude: '11.5',
    longitude: '-72.9',
    delivery_status: 'pending',
    route_position: null,
    notes: null,
    delivered_at: null,
    created_at: null,
    kitchen_state: 'none',
    quote_status: 'pending_quote',
    quote_distance_km: null,
    quoted_fee: null,
    quote_failure_reason: null,
    emission_status: null,
    emission_failure_reason: null,
    ...over,
  }) as Delivery

describe('el estado de la cotización', () => {
  it('sin cotizar NO se lee como gratis', () => {
    // Un cero aquí sería una mentira que el total confirma: el pedido saldría sin domicilio.
    const badge = quoteBadge(delivery())
    expect(badge.label).toBe('Sin cotizar')
    expect(badge.tone).toBe('waiting')
  })

  it('sin ubicación dice que eso es lo que falta', () => {
    expect(quoteBadge(delivery({ latitude: null })).detail).toContain('ubicación')
  })

  it('fuera de cobertura explica sus dos consecuencias', () => {
    const badge = quoteBadge(delivery({ quote_status: 'outside_coverage' }))
    expect(badge.tone).toBe('blocked')
    expect(badge.detail).toContain('No se cobra')
    expect(badge.detail).toContain('cocina')
  })

  it('no cotizable muestra el motivo guardado, no un genérico', () => {
    const badge = quoteBadge(
      delivery({
        quote_status: 'unquotable',
        quote_failure_reason: 'La sucursal no tiene bandas de tarifa configuradas.',
      }),
    )
    expect(badge.detail).toBe('La sucursal no tiene bandas de tarifa configuradas.')
  })

  it('cotizado no necesita explicación', () => {
    expect(quoteBadge(delivery({ quote_status: 'quoted' })).tone).toBe('ok')
  })
})

describe('el estado del enlace de pago', () => {
  it('no se menciona antes de que haya cotización', () => {
    // "No enviado" sobre algo que aún no tiene precio culpa a la mensajería de algo ajeno.
    expect(emissionBadge(delivery())).toBeNull()
    expect(emissionBadge(delivery({ quote_status: 'outside_coverage' }))).toBeNull()
  })

  it('un envío fallido se ve, y con su motivo', () => {
    const badge = emissionBadge(
      delivery({
        quote_status: 'quoted',
        emission_status: 'failed',
        emission_failure_reason: 'El puente de WhatsApp rechazó el mensaje.',
      }),
    )
    expect(badge?.tone).toBe('blocked')
    expect(badge?.detail).toContain('puente de WhatsApp')
  })

  it('sin WhatsApp no es un fallo: es un relevo a una persona', () => {
    const badge = emissionBadge(
      delivery({ quote_status: 'quoted', emission_status: 'no_contact' }),
    )
    expect(badge?.tone).toBe('waiting')
    expect(badge?.detail).toContain('a mano')
  })

  it('enviado no necesita explicación', () => {
    const badge = emissionBadge(
      delivery({ quote_status: 'quoted', emission_status: 'sent' }),
    )
    expect(badge?.tone).toBe('ok')
    expect(badge?.detail).toBeNull()
  })
})

describe('cuándo se ofrece reemitir', () => {
  it('sí cuando está cotizado y el enlace no llegó', () => {
    expect(canReissue(delivery({ quote_status: 'quoted', emission_status: 'failed' }))).toBe(true)
    expect(canReissue(delivery({ quote_status: 'quoted', emission_status: 'no_contact' }))).toBe(
      true,
    )
  })

  it('no cuando ya llegó: reemitir invalidaría el enlace que el cliente tiene abierto', () => {
    expect(canReissue(delivery({ quote_status: 'quoted', emission_status: 'sent' }))).toBe(false)
  })

  it('no cuando no hay nada cotizado que reemitir', () => {
    expect(canReissue(delivery())).toBe(false)
    expect(canReissue(delivery({ quote_status: 'outside_coverage' }))).toBe(false)
  })
})
