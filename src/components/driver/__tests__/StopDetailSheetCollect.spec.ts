// En efectivo, confirmar la plata y cerrar la comanda son el mismo gesto. El botón tiene que
// decirlo: pulsarlo creyendo que sólo marca la entrega sería cobrar sin saberlo.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import StopDetailSheet from '../StopDetailSheet.vue'
import type { DriverStop } from '@/services/delivery.api'

function stop(over: Partial<DriverStop> = {}): DriverStop {
  return {
    id: 'd1',
    order_id: 'o1',
    address_text: 'Calle 9 #4-3',
    neighborhood: null,
    latitude: null,
    longitude: null,
    delivery_status: 'in_transit',
    route_position: 1,
    notes: null,
    not_delivered_reason: null,
    delivered_at: null,
    code: 'A38',
    total: 25000,
    paid: false,
    items: [{ name: 'Bandeja', quantity: 1 }],
    customer_name: 'Ana',
    customer_phone: '+573001112233',
    payment_method: 'cash',
    ...over,
  } as DriverStop
}

const mountSheet = (s: DriverStop) => mount(StopDetailSheet, { props: { stop: s } })

describe('collecting cash at the door', () => {
  it('a cash stop asks for the exact amount, in the button itself', () => {
    const wrapper = mountSheet(stop())

    expect(wrapper.text()).toContain('Cobrar en efectivo')
    const button = wrapper.get('[data-deliver]')
    expect(button.text()).toContain('25.000')
    // Y dice que además cierra: no es sólo "entregado".
    expect(button.text()).toContain('cierra la comanda')
  })

  it('a prepaid stop does not ask for money', () => {
    const wrapper = mountSheet(stop({ paid: true, payment_method: 'transfer' }))

    expect(wrapper.text()).toContain('Ya pagado')
    const button = wrapper.get('[data-deliver]')
    expect(button.text()).toContain('Marcar como entregado')
    expect(button.text()).not.toContain('Recibí')
  })

  it('the delivered action is emitted with the stop', async () => {
    const wrapper = mountSheet(stop())

    await wrapper.get('[data-deliver]').trigger('click')

    expect(wrapper.emitted('delivered')?.[0]).toEqual(['d1'])
  })

  it('a settled stop offers no verdict at all', () => {
    const wrapper = mountSheet(stop({ delivery_status: 'delivered', paid: true }))

    expect(wrapper.find('[data-deliver]').exists()).toBe(false)
  })
})
