import { describe, expect, it } from 'vitest'
import { buildOrderProgress, type ProgressTicket } from '../kitchenProgress'

const NOW = 1_000_000_000_000
const at = (min: number): string => new Date(NOW - min * 60_000).toISOString()

const t = (
  itemId: string,
  status: string,
  readyAt: string | null = null,
): ProgressTicket => ({ order_item_id: itemId, status, ready_at: readyAt })

describe('buildOrderProgress', () => {
  it('counts total and ready per order via the item→order index', () => {
    const tickets = [t('i1', 'ready'), t('i2', 'pending'), t('i3', 'in_progress')]
    const index = { i1: 'o1', i2: 'o1', i3: 'o1' }
    expect(buildOrderProgress(tickets, index).o1).toEqual({
      total: 3,
      ready: 1,
      readySinceMs: null,
    })
  })

  it('sets readySinceMs to the newest ready_at only when every ticket is ready', () => {
    const tickets = [t('i1', 'ready', at(9)), t('i2', 'ready', at(4))]
    const index = { i1: 'o1', i2: 'o1' }
    const p = buildOrderProgress(tickets, index).o1!
    expect(p).toMatchObject({ total: 2, ready: 2 })
    // newest ready_at = 4 minutes ago (the larger epoch ms)
    expect(p.readySinceMs).toBe(Date.parse(at(4)))
  })

  it('keeps readySinceMs null while any ticket is still cooking', () => {
    const tickets = [t('i1', 'ready', at(3)), t('i2', 'pending')]
    expect(buildOrderProgress(tickets, { i1: 'o1', i2: 'o1' }).o1!.readySinceMs).toBeNull()
  })

  it('splits tickets across the orders their items belong to', () => {
    const tickets = [t('i1', 'ready', at(2)), t('i2', 'pending')]
    const out = buildOrderProgress(tickets, { i1: 'o1', i2: 'o2' })
    expect(out.o1).toEqual({ total: 1, ready: 1, readySinceMs: Date.parse(at(2)) })
    expect(out.o2).toEqual({ total: 1, ready: 0, readySinceMs: null })
  })

  it('ignores tickets whose item is not in the index (e.g. closed orders)', () => {
    const out = buildOrderProgress([t('iX', 'ready', at(1))], {})
    expect(out).toEqual({})
  })

  it('leaves readySinceMs null when all ready but ready_at timestamps are missing', () => {
    const out = buildOrderProgress([t('i1', 'ready'), t('i2', 'ready')], { i1: 'o1', i2: 'o1' })
    expect(out.o1).toEqual({ total: 2, ready: 2, readySinceMs: null })
  })
})
