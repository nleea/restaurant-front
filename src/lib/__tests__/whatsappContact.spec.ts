// Cómo se nombra a alguien de quien WhatsApp no nos dio el teléfono, y cuánto quema esperar.
//
// El caso que da origen al fichero es real y salió en producción: la lista enseñaba
// `196125537607835@lid` como nombre del contacto. No es un fallo de datos —el backend guarda el
// `@lid` entero a propósito, porque es lo único con lo que se puede responder— es que la pantalla
// lo presentaba como si fuera una persona.
import { describe, expect, it } from 'vitest'

import {
  contactInitials,
  contactLabel,
  contactSubtitle,
  formatPhone,
  isPrivacyId,
  waitingHeat,
  waitingLabel,
} from '../whatsappContact'

const LID = '196125537607835@lid'

describe('identidad del contacto', () => {
  it('un @lid NUNCA se enseña como nombre', () => {
    const label = contactLabel(null, LID)
    expect(label).not.toContain('@lid')
    expect(label).not.toContain('196125537607835')
    // Los últimos cuatro sí, para poder distinguir dos conversaciones sin fingir que ese número
    // significa algo.
    expect(label).toBe('Sin nombre · 7835')
  })

  it('y el subtítulo dice POR QUÉ no hay teléfono', () => {
    expect(contactSubtitle(LID)).toBe('Número oculto por el cliente')
  })

  it('el nombre guardado siempre gana', () => {
    expect(contactLabel('Ana Restrepo', LID)).toBe('Ana Restrepo')
  })

  it('un teléfono de verdad se formatea para leerlo en voz alta', () => {
    expect(formatPhone('573001112233')).toBe('+57 300 111 2233')
    expect(formatPhone('+573001112233')).toBe('+57 300 111 2233')
    expect(formatPhone('3001112233')).toBe('300 111 2233')
  })

  it('un formato que no reconocemos se deja tal cual, sin inventar', () => {
    expect(formatPhone('12345')).toBe('12345')
  })

  it('las iniciales no fingen con un @lid', () => {
    expect(contactInitials('Ana Restrepo', LID)).toBe('AR')
    expect(contactInitials(null, '573001112233')).toBe('33')
    expect(contactInitials(null, LID)).toBe('—')
  })

  it('reconoce el identificador de privacidad', () => {
    expect(isPrivacyId(LID)).toBe(true)
    expect(isPrivacyId('573001112233')).toBe(false)
  })
})

describe('el calor de la espera', () => {
  const NOW = new Date('2026-08-01T15:00:00Z')
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString()

  it('un hilo ya contestado no quema, por viejo que sea', () => {
    expect(waitingHeat(false, minutesAgo(600), NOW)).toBe(0)
    expect(waitingLabel(false, minutesAgo(600), NOW)).toBe('')
  })

  it('crece con los minutos y se satura a la hora', () => {
    expect(waitingHeat(true, minutesAgo(6), NOW)).toBeCloseTo(0.1)
    expect(waitingHeat(true, minutesAgo(30), NOW)).toBeCloseTo(0.5)
    expect(waitingHeat(true, minutesAgo(60), NOW)).toBe(1)
    // Y no pasa de 1: a las tres horas ya no hay más rojo que dar.
    expect(waitingHeat(true, minutesAgo(180), NOW)).toBe(1)
  })

  it('recién llegado quema un poco, no nada', () => {
    // Cero se reserva para "no es tu turno". Un mensaje de hace diez segundos SÍ es tu turno.
    expect(waitingHeat(true, minutesAgo(0), NOW)).toBeGreaterThan(0)
  })

  it('lo dice en la unidad que se entiende de un vistazo', () => {
    expect(waitingLabel(true, minutesAgo(0), NOW)).toBe('Ahora mismo')
    expect(waitingLabel(true, minutesAgo(8), NOW)).toBe('8 min esperando')
    expect(waitingLabel(true, minutesAgo(125), NOW)).toBe('2 h esperando')
    expect(waitingLabel(true, minutesAgo(60 * 30), NOW)).toBe('1 d esperando')
  })
})
