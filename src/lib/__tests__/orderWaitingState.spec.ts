// Qué se le dice al cliente de un pedido que todavía debe plata.
//
// El caso que da nombre al fichero es el tercero: **"esperando tu pago" no es lo mismo que
// "revisando tu comprobante"**. Pedirle el comprobante a quien acaba de mandarlo se lee como que no
// llegó, y es la pregunta que ese tercer estado evita.
import { describe, expect, it } from 'vitest'

import { waitingCopy } from '../orderWaitingState'

describe('waitingCopy', () => {
  it('un prepago sin pagar espera el pago, y NUNCA dice que está en preparación', () => {
    const copy = waitingCopy({ paymentMethod: 'transfer', balance: 46000, proofPending: false })
    expect(copy.state).toBe('awaiting_payment')
    expect(copy.label).toBe('Esperando tu pago')
    expect(copy.detail).toContain('entra a cocina')
    expect(copy.detail).not.toContain('preparación')
  })

  it('con un comprobante pendiente no se le vuelve a pedir', () => {
    const copy = waitingCopy({ paymentMethod: 'transfer', balance: 46000, proofPending: true })
    expect(copy.state).toBe('reviewing_proof')
    expect(copy.label).toBe('Revisando tu comprobante')
    expect(copy.detail).toContain('Ya lo recibimos')
  })

  it('en efectivo no debe nada por adelantado', () => {
    // Se cobra en la puerta: pedirle un comprobante sería pedirle algo que no existe.
    const copy = waitingCopy({ paymentMethod: 'cash', balance: 46000, proofPending: false })
    expect(copy.state).toBe('normal')
    expect(copy.label).toBe('')
  })

  it('sin método declarado se trata como efectivo', () => {
    expect(waitingCopy({ paymentMethod: null, balance: 46000, proofPending: false }).state).toBe(
      'normal',
    )
  })

  it('un prepago ya saldado vuelve al estado normal', () => {
    expect(waitingCopy({ paymentMethod: 'transfer', balance: 0, proofPending: false }).state).toBe(
      'normal',
    )
    // Y un saldo negativo (pagó de más) tampoco es una deuda.
    expect(waitingCopy({ paymentMethod: 'transfer', balance: -500, proofPending: false }).state).toBe(
      'normal',
    )
  })
})
