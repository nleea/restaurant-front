// Station meta derived from the branch's DB stations. The backend station row carries only
// (id, name, position, is_active); the KDS chrome needs a two-letter tag and a cold-hold
// threshold per station, so both are derived here — deterministically, with no hardcoded
// station set.

import type { StationMeta } from './types'

/** Fallback cold-hold threshold (minutes) when a station's name has no configured override. */
export const DEFAULT_WAIT_MIN = 5

// Cold-hold minutes by normalized station name. Mirrors the prototype's values for the common
// Spanish station names; tune with kitchen feedback. Keys are `normalizeName()` output.
export const WAIT_MIN_BY_NAME: Record<string, number> = {
  parrilla: 6,
  grill: 6,
  fritura: 3,
  freidora: 3,
  frios: 5,
  ensaladas: 5,
  bar: 4,
  bebidas: 4,
  montaje: 2,
  ensamble: 2,
  plancha: 6,
  postres: 8,
  horno: 6,
}

/** Lowercase, accent-stripped, trimmed — the lookup key for name-based config. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function waitMinFor(name: string): number {
  return WAIT_MIN_BY_NAME[normalizeName(name)] ?? DEFAULT_WAIT_MIN
}

// Two-letter tag from the station name: first two significant letters, uppercased ("Parrilla" →
// "PA"; "Barra fría" → "BA"). On collision, keep the first letter and walk the rest of the name
// for a distinguishing second letter ("Postres" vs "Parrilla" → "PO"/"PA"); as a last resort use
// a digit so the tag is always unique within the branch.
export function deriveTag(name: string, taken: Set<string>): string {
  const letters = normalizeName(name).replace(/[^a-z]/g, '')
  const first = (letters[0] ?? 'x').toUpperCase()
  const candidates: string[] = []
  for (let i = 1; i < letters.length; i++) candidates.push(first + (letters[i] as string).toUpperCase())
  candidates.push(first + first)
  for (const tag of candidates) {
    if (!taken.has(tag)) return tag
  }
  for (let n = 2; n <= 9; n++) {
    const tag = `${first}${n}`
    if (!taken.has(tag)) return tag
  }
  return `${first}?`
}

export interface StationLike {
  id: string
  name: string
  position?: number
}

/** Rail-ordered meta for the branch's stations (position, then name for stable ties). */
export function deriveStationMeta(stations: StationLike[]): StationMeta[] {
  const ordered = [...stations].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
  )
  const taken = new Set<string>()
  return ordered.map((s) => {
    const tag = deriveTag(s.name, taken)
    taken.add(tag)
    return { id: s.id, tag, label: s.name, waitMin: waitMinFor(s.name) }
  })
}
