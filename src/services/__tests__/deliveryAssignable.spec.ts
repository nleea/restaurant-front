import { describe, expect, it } from 'vitest'
import { blockedReason, isAssignable, type Delivery } from '@/services/delivery.api'

function delivery(kitchen_state: string | null): Delivery {
  return {
    id: 'd1',
    order_id: 'o1',
    delivery_route_id: null,
    delivery_run_id: null,
    address_text: 'Calle 9',
    neighborhood: null,
    latitude: null,
    longitude: null,
    delivery_status: 'pending',
    route_position: null,
    notes: null,
    delivered_at: null,
    created_at: null,
    kitchen_state,
    quote_status: 'pending_quote',
    quote_distance_km: null,
    quoted_fee: null,
    quote_failure_reason: null,
    emission_status: null,
    emission_failure_reason: null,
  }
}

describe('kitchen gate for assigning a delivery', () => {
  it('only a cooked order can be handed to a courier', () => {
    expect(isAssignable(delivery('ready'))).toBe(true)
    expect(isAssignable(delivery('in_kitchen'))).toBe(false)
    expect(isAssignable(delivery('none'))).toBe(false)
    // Un backend viejo que no mande el campo NO debe abrir la puerta por omisión.
    expect(isAssignable(delivery(null))).toBe(false)
  })

  it('explains the block instead of leaving a dead control', () => {
    expect(blockedReason(delivery('ready'))).toBeNull()
    // El motivo distingue "se está cocinando" de "ni siquiera entró": no es lo mismo
    // esperar cinco minutos que ir a preguntar por qué nadie lo mandó.
    expect(blockedReason(delivery('in_kitchen'))).toContain('preparando')
    expect(blockedReason(delivery('none'))).toContain('no ha entrado a cocina')
  })
})
