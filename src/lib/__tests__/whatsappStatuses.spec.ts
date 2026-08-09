// El espejo de las reglas del backend. Sin red, sin reloj, sin DOM.
//
// Dos grupos sostienen el fichero: la validación (que es lo que impide guardar una tarjeta que el
// proveedor rechazaría a las once de la mañana sin nadie mirando) y el vocabulario de resultados
// (que es lo que impide que la pantalla diga "visto por N", que sería mentira).
import { describe, expect, it } from 'vitest'
import {
  addressedLabel,
  audienceLines,
  BACKGROUNDS,
  describeSchedule,
  draftErrors,
  emptyAudienceReason,
  isEveryDay,
  isTruncated,
  MAX_SLOTS,
  minuteToTime,
  minutesOfWeekday,
  publicationGlyph,
  publicationLabel,
  slotErrors,
  timeToMinute,
} from '@/lib/whatsappStatuses'
import type {
  AudiencePreview,
  StatusDraft,
  StatusSlot,
} from '@/services/messaging.api'

const ELEVEN = 660
const SIX_THIRTY = 1110

function weekly(minute: number, ...days: number[]): StatusSlot[] {
  return days.map((weekday) => ({ minute, weekday, on_date: null }))
}

function dated(minute: number, on_date: string): StatusSlot {
  return { minute, weekday: null, on_date }
}

function draft(over: Partial<StatusDraft> = {}): StatusDraft {
  return {
    type: 'text',
    content: 'Hoy hay sancocho',
    slots: weekly(ELEVEN, 0),
    bg_color: BACKGROUNDS[0],
    font: 2,
    caption: null,
    media_url: null,
    active: true,
    ...over,
  }
}

function preview(over: Partial<AudiencePreview> = {}): AudiencePreview {
  return {
    addressed: 200,
    total_candidates: 340,
    excluded_no_number: 12,
    excluded_opted_out: 4,
    excluded_inactive: 118,
    excluded_by_cap: 6,
    provider_calls: 20,
    ...over,
  }
}

describe('horas', () => {
  it('convierte minutos a hora y vuelta', () => {
    expect(minuteToTime(ELEVEN)).toBe('11:00')
    expect(minuteToTime(SIX_THIRTY)).toBe('18:30')
    expect(minuteToTime(0)).toBe('00:00')
    expect(timeToMinute('11:00')).toBe(ELEVEN)
    expect(timeToMinute('18:30')).toBe(SIX_THIRTY)
  })

  it('rechaza lo que no es una hora', () => {
    expect(timeToMinute('')).toBeNull()
    expect(timeToMinute('25:00')).toBeNull()
    expect(timeToMinute('11:70')).toBeNull()
    expect(timeToMinute('once')).toBeNull()
  })
})

describe('el horario', () => {
  it('siete días a la misma hora es "todos los días"', () => {
    expect(isEveryDay(weekly(ELEVEN, 0, 1, 2, 3, 4, 5, 6))).toBe(true)
    expect(describeSchedule(weekly(ELEVEN, 0, 1, 2, 3, 4, 5, 6))).toBe(
      'Todos los días a las 11:00',
    )
  })

  it('siete días a horas distintas NO es "todos los días"', () => {
    const mixed = [...weekly(ELEVEN, 0, 1, 2, 3, 4, 5), ...weekly(SIX_THIRTY, 6)]
    expect(isEveryDay(mixed)).toBe(false)
  })

  it('agrupa los días que comparten hora', () => {
    expect(describeSchedule(weekly(SIX_THIRTY, 4, 5))).toBe('V, S a las 18:30')
  })

  it('cuenta las dos horas de un mismo día en orden de reloj', () => {
    const slots = [...weekly(SIX_THIRTY, 0), ...weekly(ELEVEN, 0)]
    expect(describeSchedule(slots)).toBe('L a las 11:00 · L a las 18:30')
  })

  it('cuenta una fecha concreta', () => {
    expect(describeSchedule([dated(SIX_THIRTY, '2026-08-15')])).toBe(
      '2026-08-15 a las 18:30',
    )
  })

  it('sin franjas no dice nada', () => {
    expect(describeSchedule([])).toBe('')
  })

  it('saca las horas ocupadas de un día, ordenadas', () => {
    const slots = [...weekly(SIX_THIRTY, 0), ...weekly(ELEVEN, 0), ...weekly(ELEVEN, 3)]
    expect(minutesOfWeekday(slots, 0)).toEqual([ELEVEN, SIX_THIRTY])
    expect(minutesOfWeekday(slots, 3)).toEqual([ELEVEN])
    expect(minutesOfWeekday(slots, 5)).toEqual([])
  })
})

describe('validación de la tarjeta', () => {
  it('una tarjeta completa se puede guardar', () => {
    expect(draftErrors(draft())).toEqual([])
  })

  it('un texto sin color de fondo no se puede guardar', () => {
    const errors = draftErrors(draft({ bg_color: null }))
    expect(errors.some((e) => e.includes('color'))).toBe(true)
  })

  it('un texto sin fuente no se puede guardar', () => {
    const errors = draftErrors(draft({ font: null }))
    expect(errors.some((e) => e.includes('fuente'))).toBe(true)
  })

  it('una imagen no necesita ninguno de los dos', () => {
    const image = draft({
      type: 'image',
      content: 'https://cdn.test/menu.jpg',
      bg_color: null,
      font: null,
    })
    expect(draftErrors(image)).toEqual([])
  })

  it('sin contenido no se puede guardar, y lo dice según el tipo', () => {
    // Sólo espacios cuenta como vacío: un estado en blanco no es un estado.
    expect(draftErrors(draft({ content: '   ' }))).not.toEqual([])
    expect(draftErrors(draft({ content: '' }))[0]).toContain('texto')
    expect(
      draftErrors(
        draft({ type: 'image', content: '', bg_color: null, font: null }),
      )[0],
    ).toContain('imagen')
  })

  it('un borrador sin franjas es válido: guardar sin horario es legítimo', () => {
    expect(draftErrors(draft({ slots: [] }))).toEqual([])
  })
})

describe('validación de las franjas', () => {
  it('una franja con día Y fecha se rechaza', () => {
    const bad: StatusSlot = { minute: ELEVEN, weekday: 0, on_date: '2026-08-15' }
    expect(slotErrors([bad])).not.toEqual([])
  })

  it('una franja sin día ni fecha se rechaza', () => {
    expect(slotErrors([{ minute: ELEVEN, weekday: null, on_date: null }])).not.toEqual([])
  })

  it('nombra la franja culpable', () => {
    const slots: StatusSlot[] = [
      ...weekly(ELEVEN, 0),
      { minute: ELEVEN, weekday: 0, on_date: '2026-08-15' },
    ]
    expect(slotErrors(slots)[0]).toContain('Franja 2')
  })

  it('dos franjas idénticas se rechazan', () => {
    expect(slotErrors([...weekly(ELEVEN, 0), ...weekly(ELEVEN, 0)])).not.toEqual([])
  })

  it('demasiadas franjas se rechazan', () => {
    const many = Array.from({ length: MAX_SLOTS + 1 }, (_, i) => ({
      minute: i * 10,
      weekday: 0,
      on_date: null,
    }))
    expect(slotErrors(many)[0]).toContain('Demasiadas')
  })
})

describe('la audiencia', () => {
  it('itemiza las cuatro bajas, en el orden en que ocurren', () => {
    expect(audienceLines(preview()).map((l) => l.key)).toEqual([
      'no_number',
      'opted_out',
      'inactive',
      'cap',
    ])
  })

  it('omite las bajas que son cero: una línea a cero es ruido', () => {
    const lines = audienceLines(
      preview({ excluded_no_number: 0, excluded_opted_out: 0, excluded_by_cap: 0 }),
    )
    expect(lines.map((l) => l.key)).toEqual(['inactive'])
  })

  it('marca la truncación, que es lo único que distingue "a todos los que puede"', () => {
    expect(isTruncated(preview())).toBe(true)
    expect(isTruncated(preview({ excluded_by_cap: 0 }))).toBe(false)
    expect(audienceLines(preview()).find((l) => l.key === 'cap')?.truncation).toBe(true)
  })

  it('explica una audiencia vacía por no haber nadie', () => {
    const reason = emptyAudienceReason(
      preview({
        addressed: 0,
        total_candidates: 0,
        excluded_no_number: 0,
        excluded_opted_out: 0,
        excluded_inactive: 0,
        excluded_by_cap: 0,
      }),
    )
    expect(reason).toContain('nadie le ha escrito')
  })

  it('explica una audiencia vacía por exclusiones, con los números', () => {
    const reason = emptyAudienceReason(
      preview({
        addressed: 0,
        total_candidates: 4,
        excluded_no_number: 0,
        excluded_opted_out: 4,
        excluded_inactive: 0,
        excluded_by_cap: 0,
      }),
    )
    expect(reason).toContain('4')
    expect(reason).toContain('no recibir')
  })
})

describe('el vocabulario de los resultados', () => {
  it('los cuatro finales tienen nombres distintos', () => {
    const labels = (
      ['published', 'failed', 'skipped_late', 'skipped_empty'] as const
    ).map(publicationLabel)
    expect(new Set(labels).size).toBe(4)
  })

  it('separa "se pasó la hora" de "sin audiencia": se arreglan de formas opuestas', () => {
    expect(publicationLabel('skipped_late')).toContain('hora')
    expect(publicationLabel('skipped_empty')).toContain('audiencia')
  })

  it('los cuatro se distinguen sin color, por su glifo', () => {
    const glyphs = (
      ['published', 'failed', 'skipped_late', 'skipped_empty'] as const
    ).map(publicationGlyph)
    expect(new Set(glyphs).size).toBe(4)
  })

  it('dice "enviado a", nunca "visto" ni "entregado"', () => {
    const text = addressedLabel(200)
    expect(text).toBe('enviado a 200 contactos')
    for (const forbidden of ['visto', 'entregado', 'leído', 'recib']) {
      expect(text.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('el singular y el cero se leen bien', () => {
    expect(addressedLabel(1)).toBe('enviado a 1 contacto')
    expect(addressedLabel(0)).toBe('no se envió a nadie')
  })
})
