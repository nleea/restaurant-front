import { describe, expect, it } from 'vitest'
import { conceptLabel } from '../cashConcepts'

describe('conceptLabel', () => {
  it('maps known integration concepts to Spanish labels', () => {
    expect(conceptLabel('sale')).toBe('Venta')
    expect(conceptLabel('purchase_payment')).toBe('Pago a proveedor')
    expect(conceptLabel('credit_payment')).toBe('Abono fiado')
  })

  it('passes through a free-text concept unchanged', () => {
    expect(conceptLabel('Propina')).toBe('Propina')
    expect(conceptLabel('')).toBe('')
  })
})
