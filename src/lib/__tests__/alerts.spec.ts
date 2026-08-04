// Cómo se le habla al dueño de una alerta: cuánto lleva encendida y cuánto quema.
import { describe, expect, it } from 'vitest'

import { elapsedLabel, heatOf, RULE_KEYS, RULE_LABEL } from '../alerts'

const NOW = new Date('2026-07-30T20:00:00Z').getTime()
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

describe('cuánto lleva encendida', () => {
  it('dice minutos, horas o días — no una hora que haya que restar', () => {
    expect(elapsedLabel(ago(0), NOW)).toBe('ahora mismo')
    expect(elapsedLabel(ago(5), NOW)).toBe('hace 5 min')
    expect(elapsedLabel(ago(90), NOW)).toBe('hace 1 h')
    expect(elapsedLabel(ago(60 * 30), NOW)).toBe('hace 1 día')
    expect(elapsedLabel(ago(60 * 72), NOW)).toBe('hace 3 días')
  })

  it('no inventa nada sin fecha', () => {
    expect(elapsedLabel(null, NOW)).toBe('—')
    expect(elapsedLabel('no es una fecha', NOW)).toBe('—')
  })

  it('no cuenta hacia atrás con un reloj adelantado', () => {
    // Un cliente con la hora mal no debe leer "hace -3 min".
    expect(elapsedLabel(new Date(NOW + 60_000).toISOString(), NOW)).toBe('ahora mismo')
  })
})

describe('el calor', () => {
  it('una alerta tomada no quema: ya hay alguien encima', () => {
    expect(heatOf('acknowledged', ago(600), NOW)).toBe('none')
  })

  it('lo recién encendido tibia; lo que lleva media hora quema', () => {
    expect(heatOf('fired', ago(5), NOW)).toBe('warm')
    expect(heatOf('fired', ago(45), NOW)).toBe('hot')
  })

  it('sin fecha se queda en tibio, no en frío', () => {
    // Ante la duda, que se vea: una alerta sin marca de tiempo no puede parecer atendida.
    expect(heatOf('fired', null, NOW)).toBe('warm')
  })
})

describe('el vocabulario', () => {
  it('cada regla conocida tiene nombre', () => {
    for (const key of RULE_KEYS) {
      expect(RULE_LABEL[key]).toBeTruthy()
    }
  })

  it('los nombres hablan de lo que pasa, no de estados internos', () => {
    expect(RULE_LABEL.low_stock).toBe('Se está acabando un insumo')
    expect(RULE_LABEL.whatsapp_session_down).toBe('El WhatsApp dejó de recibir')
  })
})
