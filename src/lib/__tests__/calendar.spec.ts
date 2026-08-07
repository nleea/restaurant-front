import { describe, expect, it } from 'vitest'
import {
  compactRange,
  compactTime,
  durationHours,
  formatHours,
  fromISODate,
  monthMatrix,
  railSegment,
  shiftMonth,
  toISODate,
  totalHours,
} from '@/lib/calendar'

describe('toISODate / fromISODate', () => {
  it('round-trips a local calendar day', () => {
    expect(toISODate(new Date(2026, 6, 30))).toBe('2026-07-30')
    expect(fromISODate('2026-07-30').getDate()).toBe(30)
    expect(fromISODate('2026-07-30').getMonth()).toBe(6)
  })

  it('reads a bare date as local, not UTC', () => {
    // The bug this guards: `new Date('2026-01-01')` is UTC midnight, which is Dec 31 in Colombia.
    const d = fromISODate('2026-01-01')
    expect(toISODate(d)).toBe('2026-01-01')
    expect(d.getDate()).toBe(1)
  })

  it('zero-pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('monthMatrix', () => {
  const july = monthMatrix(2026, 6, new Date(2026, 6, 30))

  it('is always six full weeks so the grid height never jumps', () => {
    expect(july).toHaveLength(42)
    expect(monthMatrix(2026, 1, new Date(2026, 6, 30))).toHaveLength(42)
  })

  it('starts on the Monday on or before the 1st', () => {
    // July 1 2026 is a Wednesday, so the grid opens on Monday June 29.
    const opening = july[0]!
    expect(opening.iso).toBe('2026-06-29')
    expect(opening.date.getDay()).toBe(1)
    expect(opening.inMonth).toBe(false)
  })

  it('flags in-month days, today and the weekend', () => {
    const first = july.find((d) => d.iso === '2026-07-01')!
    expect(first.inMonth).toBe(true)
    expect(first.dayNumber).toBe(1)

    expect(july.filter((d) => d.isToday)).toHaveLength(1)
    expect(july.find((d) => d.isToday)!.iso).toBe('2026-07-30')

    // Saturday July 4 and Sunday July 5.
    expect(july.find((d) => d.iso === '2026-07-04')!.isWeekend).toBe(true)
    expect(july.find((d) => d.iso === '2026-07-05')!.isWeekend).toBe(true)
    expect(july.find((d) => d.iso === '2026-07-06')!.isWeekend).toBe(false)
  })

  it('contains every day of the month exactly once', () => {
    const inMonth = july.filter((d) => d.inMonth)
    expect(inMonth).toHaveLength(31)
    expect(new Set(inMonth.map((d) => d.iso)).size).toBe(31)
  })

  it('has no today when the month is not the current one', () => {
    expect(monthMatrix(2025, 0, new Date(2026, 6, 30)).some((d) => d.isToday)).toBe(false)
  })
})

describe('shiftMonth', () => {
  it('rolls the year over in both directions', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0])
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11])
    expect(shiftMonth(2026, 5, 1)).toEqual([2026, 6])
  })
})

describe('time formatting', () => {
  it('drops seconds and a zero minute', () => {
    expect(compactTime('12:00:00')).toBe('12')
    expect(compactTime('12:30')).toBe('12:30')
    expect(compactTime('07:00')).toBe('7')
    expect(compactRange('12:00:00', '21:00:00')).toBe('12–21')
  })

  it('computes duration and month totals', () => {
    expect(durationHours('12:00', '21:00')).toBe(9)
    expect(durationHours('12:00', '12:30')).toBe(0.5)
    expect(
      totalHours([
        { start_time: '08:00', end_time: '16:00' },
        { start_time: '18:00', end_time: '22:30' },
      ]),
    ).toBe(12.5)
  })

  it('formats hours without a trailing .0', () => {
    expect(formatHours(48)).toBe('48')
    expect(formatHours(47.5)).toBe('47.5')
    expect(formatHours(8.333333)).toBe('8.3')
  })
})

describe('railSegment', () => {
  it('places a shift across the 24 h track', () => {
    expect(railSegment('12:00', '21:00')).toEqual({ left: 50, width: 37.5 })
    expect(railSegment('00:00', '24:00')).toEqual({ left: 0, width: 100 })
    expect(railSegment('06:00', '12:00')).toEqual({ left: 25, width: 25 })
  })

  it('keeps a very short shift visible', () => {
    // 15 min is 1.04% of a day — floored to 2% so it still paints.
    expect(railSegment('08:00', '08:15').width).toBe(2)
  })

  it('clamps out-of-range times instead of overflowing the rail', () => {
    expect(railSegment('26:00', '30:00').left).toBe(100)
    expect(railSegment('20:00', '10:00').width).toBe(2)
  })
})
