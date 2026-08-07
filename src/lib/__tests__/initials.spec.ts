import { describe, expect, it } from 'vitest'
import { initialsOf } from '@/lib/initials'

describe('initialsOf', () => {
  it('takes the first letter of the first two names', () => {
    expect(initialsOf('Ana Restrepo')).toBe('AR')
    expect(initialsOf('juan carlos gómez')).toBe('JC')
  })

  it('doubles up on a single name', () => {
    expect(initialsOf('Ana')).toBe('AN')
  })

  it('reads an email by its local part, never the domain', () => {
    // The bug this guards: everyone at the same tenant collapsing to "…D" or "…C".
    expect(initialsOf('carla@demo.com')).toBe('CA')
    expect(initialsOf('ana.lopez@demo.com')).toBe('AL')
    expect(initialsOf('bruno_diaz@demo.com')).toBe('BD')
  })

  it('keeps accented and non-ASCII names', () => {
    expect(initialsOf('Ángela Ñungo')).toBe('ÁÑ')
  })

  it('degrades to a placeholder rather than an empty circle', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
    expect(initialsOf('—')).toBe('?')
    expect(initialsOf('...')).toBe('?')
  })
})
