import { describe, expect, it } from 'vitest'
import {
  KITCHEN_HEAT,
  elapsedMinutes,
  elapsedMinutesFromMs,
  formatMinutes,
  heatLevel,
  oldestElapsedMinutes,
  parseTs,
  prepMinutes,
} from '../kitchenTime'

const NOW = 1_000_000_000_000 // fixed epoch ms
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString()

describe('elapsedMinutesFromMs', () => {
  it('counts whole minutes since an epoch-ms instant', () => {
    expect(elapsedMinutesFromMs(NOW - 7 * 60_000, NOW)).toBe(7)
  })
  it('never goes negative and is null for a null instant', () => {
    expect(elapsedMinutesFromMs(NOW + 60_000, NOW)).toBe(0)
    expect(elapsedMinutesFromMs(null, NOW)).toBeNull()
  })
})

describe('parseTs', () => {
  it('returns null for missing/invalid', () => {
    expect(parseTs(null)).toBeNull()
    expect(parseTs(undefined)).toBeNull()
    expect(parseTs('not-a-date')).toBeNull()
  })
  it('parses ISO to epoch ms', () => {
    expect(parseTs(new Date(NOW).toISOString())).toBe(NOW)
  })
})

describe('elapsedMinutes', () => {
  it('counts whole minutes since the timestamp', () => {
    expect(elapsedMinutes(ago(8), NOW)).toBe(8)
  })
  it('never goes negative (future timestamp)', () => {
    expect(elapsedMinutes(ago(-5), NOW)).toBe(0)
  })
  it('is null when timestamp is missing', () => {
    expect(elapsedMinutes(null, NOW)).toBeNull()
  })
})

describe('prepMinutes', () => {
  it('measures entered→ready in whole minutes', () => {
    expect(prepMinutes(ago(10), ago(3))).toBe(7)
  })
  it('is null when either timestamp is missing', () => {
    expect(prepMinutes(ago(10), null)).toBeNull()
    expect(prepMinutes(null, ago(3))).toBeNull()
  })
})

describe('heatLevel', () => {
  it('escalates fresh → warm → hot at the thresholds', () => {
    expect(heatLevel(KITCHEN_HEAT.amberMin - 1)).toBe('fresh')
    expect(heatLevel(KITCHEN_HEAT.amberMin)).toBe('warm')
    expect(heatLevel(KITCHEN_HEAT.redMin)).toBe('hot')
  })
  it('treats a null time as fresh', () => {
    expect(heatLevel(null)).toBe('fresh')
  })
  it('honors custom thresholds', () => {
    expect(heatLevel(5, { amberMin: 10, redMin: 20 })).toBe('fresh')
  })
})

describe('formatMinutes', () => {
  it('formats sub-minute, minutes, and hours', () => {
    expect(formatMinutes(0)).toBe('recién')
    expect(formatMinutes(42)).toBe('42 min')
    expect(formatMinutes(75)).toBe('1 h 15 min')
  })
  it('is empty for a null time', () => {
    expect(formatMinutes(null)).toBe('')
  })
})

describe('oldestElapsedMinutes', () => {
  it('returns the largest elapsed, ignoring missing timestamps', () => {
    expect(oldestElapsedMinutes([ago(3), null, ago(9)], NOW)).toBe(9)
  })
  it('is null when no timestamp is present', () => {
    expect(oldestElapsedMinutes([null, undefined], NOW)).toBeNull()
  })
})
