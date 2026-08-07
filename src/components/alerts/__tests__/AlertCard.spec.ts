// La tarjeta de una alerta: que se vea quién se está encargando, y que lo que lleva rato
// sin atender se note sin tener que leer la hora.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import AlertCard from '../AlertCard.vue'

const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  rule_key: 'low_stock' as const,
  subject_ref: 'ing-tomate',
  subject_label: 'Tomate',
  status: 'fired' as const,
  fired_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  acknowledged_at: null,
  acknowledged_by: null,
  holder_name: null,
  last_escalated_at: null, reminders_muted_at: null,
  ...over,
})

function mountCard(over: Record<string, unknown> = {}) {
  return mount(AlertCard, {
    props: { alert: alert(), busy: false, subjectLabel: 'Tomate', ...over },
  })
}

describe('AlertCard', () => {
  it('nombra el sujeto y la regla', () => {
    const text = mountCard().text()
    expect(text).toContain('Tomate')
    expect(text).toContain('Se está acabando un insumo')
  })

  it('cae en la referencia cruda si nadie tradujo el sujeto', () => {
    // Fea pero identifica: mejor que un hueco.
    expect(mountCard({ subjectLabel: undefined }).text()).toContain('ing-tomate')
  })

  it('ofrece hacerse cargo cuando nadie la ha tomado', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-testid="acknowledge"]').trigger('click')
    expect(wrapper.emitted('acknowledge')?.[0]).toEqual(['a1'])
  })

  it('tomada, dice quién y ya no se puede volver a tomar', () => {
    const wrapper = mountCard({
      alert: alert({ status: 'acknowledged', holder_name: 'Ana Restrepo' }),
    })
    // La atribución es lo que evita que dos personas hagan el mismo trabajo.
    expect(wrapper.get('[data-testid="holder"]').text()).toContain('Ana Restrepo')
    expect(wrapper.find('[data-testid="acknowledge"]').exists()).toBe(false)
  })

  it('una alerta tomada deja de quemar', () => {
    const wrapper = mountCard({
      alert: alert({ status: 'acknowledged', holder_name: 'Ana' }),
    })
    expect(wrapper.get('[data-alert]').attributes('data-heat')).toBe('none')
  })

  it('lo que lleva media hora sin atender quema', () => {
    const wrapper = mountCard({
      alert: alert({ fired_at: new Date(Date.now() - 45 * 60_000).toISOString() }),
    })
    expect(wrapper.get('[data-alert]').attributes('data-heat')).toBe('hot')
  })

  it('dice cuánto lleva encendida', () => {
    expect(mountCard().get('[data-testid="elapsed"]').text()).toContain('hace 5 min')
  })

  it('marca la que ya salió por WhatsApp', () => {
    const wrapper = mountCard({
      alert: alert({ last_escalated_at: new Date().toISOString() }),
    })
    // Que se sepa que ya se gastó un mensaje en esto.
    expect(wrapper.get('[data-testid="escalated"]').text()).toContain('WhatsApp')
  })

  it('no deja tomarla dos veces mientras va en camino', () => {
    const wrapper = mountCard({ busy: true })
    expect(wrapper.get('[data-testid="acknowledge"]').attributes('disabled')).toBeDefined()
  })
})

// --- La tercera salida: "ya lo sé" -------------------------------------------
// Silenciar y tomar tienen que verse DISTINTO. Si se confundieran, la gente pulsaría "me
// encargo" sólo para callar el aviso, y el registro de quién atiende qué —lo único que hace
// útil este panel— se llenaría de dueños falsos en una semana.
describe('silenciar', () => {
  it('ofrece callarla sin tomarla', () => {
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="mute"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="acknowledge"]').exists()).toBe(true)
  })

  it('emite el id al pulsarlo', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-testid="mute"]').trigger('click')
    expect(wrapper.emitted('mute')?.[0]).toEqual([wrapper.props('alert').id])
  })

  it('una silenciada lo dice, y NO dice que la tenga nadie', () => {
    const wrapper = mountCard({
      alert: alert({ reminders_muted_at: new Date().toISOString() }),
    })

    expect(wrapper.get('[data-testid="muted"]').text()).toContain('Sin recordatorios')
    // Lo que no puede pasar: que se lea como tomada.
    expect(wrapper.find('[data-testid="holder"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('La tiene')
  })

  it('una silenciada ya no ofrece volver a callarla', () => {
    const wrapper = mountCard({
      alert: alert({ reminders_muted_at: new Date().toISOString() }),
    })
    expect(wrapper.find('[data-testid="mute"]').exists()).toBe(false)
  })

  it('una tomada no ofrece silenciar: ya está callada', () => {
    const wrapper = mountCard({
      alert: alert({ status: 'acknowledged', holder_name: 'Ana' }),
    })
    expect(wrapper.find('[data-testid="mute"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="holder"]').text()).toContain('Ana')
  })

  it('el botón se nombra para quien no ve la pantalla', () => {
    // El alcance ("sólo esta alerta") se explica en la vista, no aquí: un `title` por tarjeta no
    // existe sin ratón, y esto se usa con el dedo en una tablet.
    const label = mountCard().get('[data-testid="mute"]').attributes('aria-label') ?? ''
    expect(label).toContain('sólo esta alerta')
  })
})
