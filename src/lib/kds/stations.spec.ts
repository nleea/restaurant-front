import { describe, expect, it } from 'vitest'
import { DEFAULT_WAIT_MIN, deriveStationMeta, deriveTag, waitMinFor } from './stations'

describe('waitMinFor', () => {
  it('matches configured names ignoring case and accents', () => {
    expect(waitMinFor('Parrilla')).toBe(6)
    expect(waitMinFor('FRÍOS')).toBe(5)
    expect(waitMinFor('freidora')).toBe(3)
  })
  it('falls back to the default for unknown names', () => {
    expect(waitMinFor('Wok')).toBe(DEFAULT_WAIT_MIN)
  })
})

describe('deriveTag', () => {
  it('takes the first two letters, uppercased and accent-stripped', () => {
    expect(deriveTag('Parrilla', new Set())).toBe('PA')
    expect(deriveTag('Fríos', new Set())).toBe('FR')
  })
  it('skips non-letters', () => {
    expect(deriveTag('2a Plancha', new Set())).toBe('AP')
  })
  it('walks the name for a distinguishing letter on collision', () => {
    const taken = new Set(['PA'])
    expect(deriveTag('Postres', taken)).toBe('PO')
  })
  it('degrades to a digit when every letter pair is taken', () => {
    const taken = new Set(['BA', 'BR', 'BB'])
    expect(deriveTag('Bar', taken)).toBe('B2')
  })
})

describe('deriveStationMeta', () => {
  const station = (id: string, name: string, position: number) => ({ id, name, position })

  it('orders by position and derives unique tags', () => {
    const meta = deriveStationMeta([
      station('s3', 'Postres', 3),
      station('s1', 'Parrilla', 1),
      station('s2', 'Pastas', 2),
    ])
    expect(meta.map((m) => m.id)).toEqual(['s1', 's2', 's3'])
    expect(meta.map((m) => m.tag)).toEqual(['PA', 'PS', 'PO'])
    expect(new Set(meta.map((m) => m.tag)).size).toBe(3)
  })

  it('carries label and waitMin per station', () => {
    const [m] = deriveStationMeta([station('s1', 'Fritura', 0)])
    expect(m).toEqual({ id: 's1', tag: 'FR', label: 'Fritura', waitMin: 3 })
  })
})
