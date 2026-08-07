// Qué se le dice al cliente sobre un pedido que todavía debe plata.
//
// Existe porque decir «En preparación» de un pedido que la cocina NO ha visto es una mentira con
// consecuencias: produce el "¿ya está listo?" y la decepción en la puerta. Un prepago sin verificar
// está detenido esperando que alguien mire un comprobante, y eso hay que decirlo con esas palabras.
//
// Vive en UN sitio y lo usan la confirmación del checkout y «mi pedido». Escrito dos veces, en tres
// meses dirían cosas distintas — y el cliente leería una en cada pantalla.

export type WaitingState = 'awaiting_payment' | 'reviewing_proof' | 'normal'

export interface WaitingInput {
  /** El método con el que nació el pedido. `cash` se cobra en la puerta: no debe nada antes. */
  paymentMethod: string | null
  /** Lo que falta por pagar. `0` o menos = saldado. */
  balance: number
  /** Si ya mandó un comprobante y está esperando que alguien lo mire. */
  proofPending: boolean
}

export interface WaitingCopy {
  state: WaitingState
  /** La etiqueta del estado. Vacía en `normal`: ahí manda el estado real del pedido. */
  label: string
  /** La frase que explica qué falta y qué va a pasar. */
  detail: string
}

/**
 * El estado de cara al cliente, derivado — nunca inventado.
 *
 * Tres situaciones y no dos: **"esperando tu pago" no es lo mismo que "revisando tu comprobante"**.
 * Pedirle el comprobante a quien acaba de mandarlo se lee como que no llegó, y es la pregunta que
 * este tercer caso evita.
 */
export function waitingCopy(input: WaitingInput): WaitingCopy {
  const prepaid = (input.paymentMethod ?? 'cash') !== 'cash'
  if (!prepaid || input.balance <= 0) {
    return { state: 'normal', label: '', detail: '' }
  }
  if (input.proofPending) {
    return {
      state: 'reviewing_proof',
      label: 'Revisando tu comprobante',
      detail:
        'Ya lo recibimos. En cuanto lo confirmemos, tu pedido entra a cocina y te avisamos.',
    }
  }
  return {
    state: 'awaiting_payment',
    label: 'Esperando tu pago',
    detail:
      'Tu pedido está guardado y entra a cocina en cuanto veamos tu comprobante. Puedes adjuntarlo aquí o mandarlo por WhatsApp.',
  }
}
