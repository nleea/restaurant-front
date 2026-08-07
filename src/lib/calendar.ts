// Hand-rolled month-grid maths for the staff scheduler. No date library: the only shapes we
// need are a Monday-first 6×7 matrix and the position of a shift inside a 24 h day.
//
// Dates are handled in LOCAL time on purpose. `shift_date` arrives as a bare "YYYY-MM-DD"
// (a calendar day, not an instant), so parsing it with `new Date(iso)` — which reads UTC —
// would shift a day backwards for every negative-offset timezone, Colombia included.

export interface CalendarDay {
  /** Local calendar date for the cell. */
  date: Date
  /** "YYYY-MM-DD" — the key shifts are grouped by. */
  iso: string
  /** Day-of-month number rendered in the cell. */
  dayNumber: number
  /** False for the leading/trailing filler days borrowed from the adjacent months. */
  inMonth: boolean
  isToday: boolean
  /** True for Saturday and Sunday — the busiest service days get a hair more contrast. */
  isWeekend: boolean
}

/** Monday-first, matching how a rota is read on the wall. */
export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

const MINUTES_PER_DAY = 24 * 60

/** Local "YYYY-MM-DD" for a Date — never `toISOString()`, which converts to UTC first. */
export function toISODate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** Parse a bare "YYYY-MM-DD" as a local midnight Date. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** 0 = Monday … 6 = Sunday. `Date.getDay()` is Sunday-first, so rotate it. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

/**
 * Always 42 cells (6 rows). A fixed height keeps the panel from jumping as the user pages
 * through months — a 5-row February next to a 6-row March is a visible lurch.
 */
export function monthMatrix(year: number, month: number, today = new Date()): CalendarDay[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - mondayIndex(first))
  const todayIso = toISODate(today)

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const weekday = mondayIndex(date)
    return {
      date,
      iso: toISODate(date),
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: toISODate(date) === todayIso,
      isWeekend: weekday >= 5,
    }
  })
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`
}

/** Step a (year, month) pair by ±1 month, rolling the year over. */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month + delta, 1)
  return [d.getFullYear(), d.getMonth()]
}

/** "12:00:00" → "12:00". Backend times may or may not carry seconds. */
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

/** "12:00" → "12", "12:30" → "12:30". The compact form used inside a day cell. */
export function compactTime(time: string): string {
  const [h, m] = hhmm(time).split(':')
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`
}

/** "12:00" + "21:00" → "12–21", the chip label. */
export function compactRange(start: string, end: string): string {
  return `${compactTime(start)}–${compactTime(end)}`
}

export function minutesOf(time: string): number {
  const [h, m] = hhmm(time).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function durationHours(start: string, end: string): number {
  return (minutesOf(end) - minutesOf(start)) / 60
}

/**
 * Where a shift sits on the day's 24 h rail, as CSS percentages. This is what turns a column
 * of times into a readable rhythm: an opening shift's bar hugs the left, a closing shift's
 * bar sits right, so a month of rota reads as shape before it reads as numbers.
 */
export function railSegment(start: string, end: string): { left: number; width: number } {
  const from = Math.max(0, Math.min(MINUTES_PER_DAY, minutesOf(start)))
  const to = Math.max(from, Math.min(MINUTES_PER_DAY, minutesOf(end)))
  return {
    left: (from / MINUTES_PER_DAY) * 100,
    // Floor the width so a very short shift still paints a visible sliver.
    width: Math.max(2, ((to - from) / MINUTES_PER_DAY) * 100),
  }
}

/** Total scheduled hours across a set of shifts — the manager's one-glance month figure. */
export function totalHours(shifts: { start_time: string; end_time: string }[]): number {
  return shifts.reduce((sum, s) => sum + durationHours(s.start_time, s.end_time), 0)
}

/** Round to at most one decimal, dropping a trailing ".0" ("48" not "48.0", but "47.5"). */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 10) / 10)
}
