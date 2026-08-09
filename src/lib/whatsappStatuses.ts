// Lógica pura de los estados de WhatsApp: horas, horario legible, y el porqué de cada baja.
//
// **Es un espejo deliberado del backend** (`messaging/domain/status_schedule.py` y
// `status_audience.py`), igual que `whatsappAutoreply.ts` lo es de `templates.py`. Duplicar
// reglas nunca es gratis, pero la alternativa —pedirle al servidor una validación por cada
// tecla— convierte un compositor en una pantalla que parpadea contra la red. La VERDAD sigue
// siendo del backend, que revalida al guardar y responde 422; si los dos discrepan, gana el 422.
//
// Dos cosas que este fichero NO tiene, y no por olvido:
//
// 1. **Ninguna función que trocee la audiencia.** Evolution parte en tandas de diez por dentro y
//    las reenvía con el mismo `messageId`, que es lo que hace que el espectador vea UNA historia.
//    Trocear convertiría 200 destinatarios en 20 historias idénticas.
// 2. **Ningún concepto de "visto" o "entregado".** El proveedor no los devuelve y devuelve 201
//    aunque se le caigan tandas. Lo más fuerte que se puede decir es "publicado" y "enviado a N".
//
// Nada de aquí toca la red, el reloj ni el DOM: quien llama trae los valores.
import type {
  AudiencePreview,
  PublicationState,
  StatusDraft,
  StatusSlot,
} from '@/services/messaging.api'

/** 0=lunes … 6=domingo. El mismo convenio que el backend, `operating_hours` y `Date` de Python. */
export const WEEKDAYS = [
  { index: 0, short: 'L', label: 'Lunes' },
  { index: 1, short: 'M', label: 'Martes' },
  { index: 2, short: 'M', label: 'Miércoles' },
  { index: 3, short: 'J', label: 'Jueves' },
  { index: 4, short: 'V', label: 'Viernes' },
  { index: 5, short: 'S', label: 'Sábado' },
  { index: 6, short: 'D', label: 'Domingo' },
] as const

export const MINUTES_PER_DAY = 24 * 60
export const MAX_SLOTS = 14

/**
 * Los fondos que se ofrecen.
 *
 * WhatsApp acepta cualquier color; se ofrece una paleta corta porque el dueño no está eligiendo
 * un color, está eligiendo cómo se ve su tarjeta, y un `input[type=color]` delante de eso invita
 * a un fucsia. Los tonos salen del propio sistema (grafito/acero + la brasa), así que un estado
 * publicado se parece al resto del producto.
 */
export const BACKGROUNDS = [
  '#1C1C1E',
  '#0B3D2E',
  '#3A2A18',
  '#7C2D12',
  '#1E3A5F',
  '#4C1D24',
] as const

/** Las fuentes que el proveedor numera. El nombre es nuestro; el número es el suyo. */
export const FONTS = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Serif' },
  { value: 2, label: 'Redondeada' },
  { value: 3, label: 'Estrecha' },
  { value: 4, label: 'Manuscrita' },
] as const

// --- Horas -------------------------------------------------------------------
/** `660` → `'11:00'`. Minutos desde medianoche, hora local de la sede. */
export function minuteToTime(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** `'11:00'` → `660`, o `null` si no es una hora. */
export function timeToMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

// --- El horario --------------------------------------------------------------
export function weeklySlots(slots: readonly StatusSlot[]): StatusSlot[] {
  return slots.filter((s) => s.weekday !== null)
}

export function datedSlots(slots: readonly StatusSlot[]): StatusSlot[] {
  return slots.filter((s) => s.on_date !== null)
}

/**
 * Las horas ocupadas de un día de la semana, ordenadas.
 *
 * Es lo que pinta la semana: una columna por día y las horas dentro.
 */
export function minutesOfWeekday(
  slots: readonly StatusSlot[],
  weekday: number,
): number[] {
  return weeklySlots(slots)
    .filter((s) => s.weekday === weekday)
    .map((s) => s.minute)
    .sort((a, b) => a - b)
}

/**
 * Si estas franjas son "todos los días a la misma hora".
 *
 * No cambia nada del guardado —siguen siendo siete franjas— pero sí cómo se cuenta: "todos los
 * días a las 11:00" se lee mucho mejor que "L, M, M, J, V, S, D a las 11:00".
 */
export function isEveryDay(slots: readonly StatusSlot[]): boolean {
  const weekly = weeklySlots(slots)
  if (weekly.length !== 7) return false
  const minutes = new Set(weekly.map((s) => s.minute))
  if (minutes.size !== 1) return false
  return new Set(weekly.map((s) => s.weekday)).size === 7
}

/** El horario en una frase, para la lista. `''` cuando no hay ninguna franja. */
export function describeSchedule(slots: readonly StatusSlot[]): string {
  if (slots.length === 0) return ''

  const parts: string[] = []
  const weekly = weeklySlots(slots)

  if (isEveryDay(slots)) {
    parts.push(`Todos los días a las ${minuteToTime(weekly[0]!.minute)}`)
  } else if (weekly.length > 0) {
    // Agrupadas por hora: "L, V a las 18:30" en vez de una línea por día.
    const byMinute = new Map<number, number[]>()
    for (const slot of weekly) {
      const days = byMinute.get(slot.minute) ?? []
      days.push(slot.weekday as number)
      byMinute.set(slot.minute, days)
    }
    for (const [minute, days] of [...byMinute.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const labels = days
        .sort((a, b) => a - b)
        .map((d) => WEEKDAYS[d]?.short ?? '?')
        .join(', ')
      parts.push(`${labels} a las ${minuteToTime(minute)}`)
    }
  }

  for (const slot of datedSlots(slots)) {
    parts.push(`${slot.on_date} a las ${minuteToTime(slot.minute)}`)
  }

  return parts.join(' · ')
}

// --- Validación (espejo del backend) -----------------------------------------
/**
 * Lo que impide guardar, en frases. Vacío = se puede guardar.
 *
 * Espejo de `validate_composition` y `validate_slots`. Se valida aquí para que el dueño no
 * descubra el problema al pulsar guardar, y se revalida allí porque es quien manda.
 */
export function draftErrors(draft: StatusDraft): string[] {
  const errors: string[] = []

  if (!draft.content.trim()) {
    errors.push(
      draft.type === 'text'
        ? 'Escribe el texto del estado.'
        : 'Sube una imagen para el estado.',
    )
  }

  if (draft.type === 'text') {
    // Los dos que WhatsApp EXIGE. Sin ellos el proveedor devuelve 400, y el estado lo publica un
    // worker a una hora programada sin nadie mirando: el dueño se enteraría por un teléfono vacío.
    if (!draft.bg_color) errors.push('Elige un color de fondo: WhatsApp lo exige.')
    if (draft.font === null) errors.push('Elige una fuente: WhatsApp la exige.')
  }

  errors.push(...slotErrors(draft.slots))
  return errors
}

export function slotErrors(slots: readonly StatusSlot[]): string[] {
  const errors: string[] = []

  if (slots.length > MAX_SLOTS) {
    errors.push(`Demasiadas franjas (${slots.length}). El máximo es ${MAX_SLOTS}.`)
  }

  const seen = new Set<string>()
  for (const [i, slot] of slots.entries()) {
    const where = `Franja ${i + 1}`
    // Exactamente uno de los dos. Es la invariante que en la base es un CHECK.
    if ((slot.weekday === null) === (slot.on_date === null)) {
      errors.push(`${where}: tiene que ser un día de la semana O una fecha, no las dos.`)
      continue
    }
    if (slot.minute < 0 || slot.minute >= MINUTES_PER_DAY) {
      errors.push(`${where}: la hora no es válida.`)
      continue
    }
    const key = `${slot.weekday}|${slot.on_date}|${slot.minute}`
    if (seen.has(key)) errors.push('Hay dos franjas con el mismo día y la misma hora.')
    seen.add(key)
  }

  return errors
}

// --- La audiencia y su desglose ----------------------------------------------
export interface AudienceLine {
  key: string
  count: number
  label: string
  /** Si esta línea es una TRUNCACIÓN — lo único que distingue "a todos los que puede". */
  truncation?: boolean
}

/**
 * Las bajas, en líneas, en el orden en que ocurren. Sólo las que no son cero.
 *
 * Que se enseñen por separado es el requisito: un total no dice *por qué* la audiencia bajó de
 * 340 a 200, y una cifra sola se lee como cobertura completa de los contactos del negocio.
 */
export function audienceLines(preview: AudiencePreview): AudienceLine[] {
  const all: AudienceLine[] = [
    {
      key: 'no_number',
      count: preview.excluded_no_number,
      label: 'sin número visible — no reciben estados',
    },
    {
      key: 'opted_out',
      count: preview.excluded_opted_out,
      label: 'pidieron no recibir',
    },
    {
      key: 'inactive',
      count: preview.excluded_inactive,
      label: 'sin escribir hace mucho',
    },
    {
      key: 'cap',
      count: preview.excluded_by_cap,
      label: 'omitidos por el tope',
      truncation: true,
    },
  ]
  return all.filter((line) => line.count > 0)
}

/** Si la audiencia se truncó. Es lo que separa "llega a todos los que puede" de "se cortó". */
export function isTruncated(preview: AudiencePreview): boolean {
  return preview.excluded_by_cap > 0
}

/**
 * Por qué la audiencia está vacía, en una frase.
 *
 * Un cero pelado no le dice nada al dueño; lo que necesita saber es si es que nadie le ha escrito
 * nunca o si es que los excluyó a todos.
 */
export function emptyAudienceReason(preview: AudiencePreview): string {
  if (preview.total_candidates === 0) {
    return 'Todavía nadie le ha escrito a este número, así que no hay a quién publicarle.'
  }
  const lines = audienceLines(preview)
  if (lines.length > 0) {
    return `Ninguno de los ${preview.total_candidates} contactos puede recibirlo: ${lines
      .map((l) => `${l.count} ${l.label}`)
      .join('; ')}.`
  }
  return 'No hay nadie a quien publicarle.'
}

// --- Resultados de una publicación -------------------------------------------
/**
 * Cómo se le cuenta al dueño lo que pasó.
 *
 * Cuatro finales y los dos "omitido" son distintos a propósito: "se pasó la hora" y "no había
 * nadie" se arreglan de formas opuestas, y un solo "omitido" mandaría a mirar donde no está.
 */
export function publicationLabel(state: PublicationState): string {
  switch (state) {
    case 'published':
      return 'Publicado'
    case 'failed':
      return 'Falló'
    case 'skipped_late':
      return 'Omitido · se pasó la hora'
    case 'skipped_empty':
      return 'Omitido · sin audiencia'
  }
}

/**
 * El glifo que acompaña al texto.
 *
 * Existe para que los cuatro finales se distingan **sin color**: el color solo no es legible para
 * todo el mundo, y aquí además el color está reservado a otra cosa en este producto.
 */
export function publicationGlyph(state: PublicationState): string {
  switch (state) {
    case 'published':
      return '✓'
    case 'failed':
      return '✕'
    case 'skipped_late':
      return '◷'
    case 'skipped_empty':
      return '○'
  }
}

/**
 * A cuántos se dirigió, en palabras.
 *
 * **"Enviado a N", nunca "visto por N" ni "entregado a N".** El proveedor no devuelve vistas y
 * devuelve 201 aunque la mitad de las tandas se caiga, así que las otras dos frases serían
 * mentira. Está en una función para que quien vaya a "mejorar" el texto lea esto primero.
 */
export function addressedLabel(count: number): string {
  if (count === 0) return 'no se envió a nadie'
  return count === 1 ? 'enviado a 1 contacto' : `enviado a ${count} contactos`
}
