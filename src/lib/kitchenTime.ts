// Kitchen time helpers — live prep/aging times derived purely from the ticket's existing
// `entered_at` / `ready_at` timestamps (no new backend data). Pure and unit-testable; the
// component supplies a shared reactive `now`.

/**
 * Global aging thresholds (minutes). A dish should move faster than table dwell, so these are
 * tighter than the floor's heat thresholds. Global for v1; per-station/branch config is a future
 * enhancement.
 */
export interface HeatThresholds {
  amberMin: number
  redMin: number
}

export const KITCHEN_HEAT: HeatThresholds = { amberMin: 6, redMin: 12 }

export type HeatLevel = 'fresh' | 'warm' | 'hot'

/** Parse an ISO timestamp to epoch ms, or null when absent/invalid. */
export function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

/** Whole minutes elapsed since epoch `ms` up to `now` (never negative), or null when `ms` is null. */
export function elapsedMinutesFromMs(ms: number | null, now: number): number | null {
  return ms === null ? null : Math.max(0, Math.floor((now - ms) / 60_000))
}

/** Whole minutes elapsed since `ts` up to `now` (never negative), or null when `ts` is missing. */
export function elapsedMinutes(ts: string | null | undefined, now: number): number | null {
  return elapsedMinutesFromMs(parseTs(ts), now)
}

/** Whole minutes a ticket took to prepare (`entered_at` → `ready_at`), or null if either is missing. */
export function prepMinutes(
  enteredAt: string | null | undefined,
  readyAt: string | null | undefined,
): number | null {
  const a = parseTs(enteredAt)
  const b = parseTs(readyAt)
  if (a === null || b === null) return null
  return Math.max(0, Math.floor((b - a) / 60_000))
}

/** Escalate aging into a heat level. A null time (no timestamp) is `fresh`. */
export function heatLevel(min: number | null, thresholds: HeatThresholds = KITCHEN_HEAT): HeatLevel {
  if (min === null) return 'fresh'
  if (min >= thresholds.redMin) return 'hot'
  if (min >= thresholds.amberMin) return 'warm'
  return 'fresh'
}

/** "recién" / "N min" / "H h M min". Empty string for a null time. */
export function formatMinutes(min: number | null): string {
  if (min === null) return ''
  if (min < 1) return 'recién'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

/** Oldest (largest) elapsed among several timestamps, ignoring missing ones; null if none present. */
export function oldestElapsedMinutes(
  timestamps: ReadonlyArray<string | null | undefined>,
  now: number,
): number | null {
  const mins = timestamps
    .map((ts) => elapsedMinutes(ts, now))
    .filter((m): m is number => m !== null)
  return mins.length ? Math.max(...mins) : null
}
