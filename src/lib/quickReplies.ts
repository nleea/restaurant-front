// Respuestas rápidas: lógica pura del editor y de la inserción en el compositor.
//
// Vive aparte de `whatsappAutoreply.ts` a propósito, aunque las dos pantallas se toquen. Ese
// fichero es el espejo de lo que el sistema contesta SOLO —saludo, avisos, FAQs—; esto no
// contesta nada. Es texto que una persona mete en el compositor y manda ella. Mezclarlos
// invitaría al siguiente lector a darle a las plantillas gatillos y un interruptor, que es
// exactamente lo que no son.
//
// Nada de aquí toca la red, el reloj ni el DOM: quien llama trae los valores.

import type { QuickReply } from '@/services/messaging.api'
import { findPlaceholders } from '@/lib/whatsappAutoreply'

// Los topes del backend (`domain/quick_reply.py`), replicados para avisar antes del 422. Viven
// aquí y no en el cliente del API por lo mismo que `whatsappAutoreply.ts` declara sus propios
// tipos: son reglas, no superficie de red, y este fichero se prueba sin tocar el API.
export const MAX_QUICK_REPLIES = 20
export const MAX_QUICK_REPLY_CHARS = 1000
export const MAX_QUICK_REPLY_NAME_CHARS = 40

/**
 * Las plantillas vigentes: las guardadas, o las sugeridas si el tenant nunca las tocó.
 *
 * **`null` no es `[]`**, igual que en las FAQs: `null` = nunca las configuró → se le ofrecen las
 * sugeridas; `[]` = las borró → se respeta. Sin la distinción, borrarlas todas y guardar haría
 * que reaparecieran en la siguiente carga.
 *
 * Ojo, y aquí se separa de `materializeFaqs`: esto es SÓLO para el editor. El compositor recibe
 * lo guardado y punto — las sugeridas se adoptan a mano, porque enseñarle al mesero plantillas
 * que el dueño nunca aprobó es poner palabras en boca del negocio.
 */
export function materializeQuickReplies(
  saved: readonly QuickReply[] | null,
  suggested: readonly QuickReply[],
): QuickReply[] {
  return (saved ?? suggested).map((entry) => ({ ...entry }))
}

/** Mueve una plantilla un puesto. Devuelve una lista nueva; en los extremos, la misma. */
export function moveQuickReply(
  entries: readonly QuickReply[],
  index: number,
  delta: -1 | 1,
): QuickReply[] {
  const target = index + delta
  if (index < 0 || index >= entries.length || target < 0 || target >= entries.length) {
    return [...entries]
  }
  const next = [...entries]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved as QuickReply)
  return next
}

/**
 * Lo que impide guardar, en el mismo orden en que el backend lo rechazaría.
 *
 * Espejo de `domain/quick_reply.py`. El 422 sigue siendo el juez; esto sólo evita el viaje de
 * ida y vuelta y le enseña al dueño el problema mientras escribe.
 *
 * A diferencia de `placeholderErrors`, no hay "sólo las encendidas" que valga: una plantilla no
 * tiene interruptor, así que todas cuentan.
 */
export function quickReplyErrors(entries: readonly QuickReply[]): string[] {
  const problems: string[] = []
  if (entries.length > MAX_QUICK_REPLIES) {
    problems.push(`Hay más de ${MAX_QUICK_REPLIES} respuestas rápidas.`)
  }
  entries.forEach((entry, index) => {
    const where = entry.name.trim() ? `"${entry.name.trim()}"` : `#${index + 1}`
    if (!entry.name.trim()) problems.push(`La respuesta rápida ${where} necesita un nombre.`)
    else if (entry.name.length > MAX_QUICK_REPLY_NAME_CHARS) {
      problems.push(`El nombre de ${where} pasa de ${MAX_QUICK_REPLY_NAME_CHARS} caracteres.`)
    }
    if (!entry.text.trim()) problems.push(`La respuesta rápida ${where} necesita un texto.`)
    else if (entry.text.length > MAX_QUICK_REPLY_CHARS) {
      problems.push(`El texto de ${where} pasa de ${MAX_QUICK_REPLY_CHARS} caracteres.`)
    }
    // Cualquier `{loquesea}`: el compositor no interpola, así que saldría con las llaves.
    const markers = [...new Set(findPlaceholders(entry.text))]
    if (markers.length > 0) {
      const offenders = markers.map((m) => `{${m}}`).join(', ')
      problems.push(`${where} usa ${offenders}, y las respuestas rápidas no rellenan marcadores.`)
    }
  })
  return problems
}

export interface DraftInsertion {
  text: string
  /** Dónde queda el cursor: al final de lo insertado, listo para seguir escribiendo. */
  caret: number
}

/**
 * Mete una plantilla en el borrador **sin pisar lo que ya hay**.
 *
 * La regla #1 de `MessageComposer` es no perder trabajo ajeno —el borrador sobrevive incluso a un
 * envío fallido—, y reemplazarlo por la plantilla la rompería de la peor forma posible: el
 * trabajo perdido estaría a un toque de distancia.
 *
 * Se inserta en el cursor y se separa con un espacio sólo cuando hace falta, para que dos
 * plantillas seguidas se concatenen legibles en vez de pegarse ("GraciasVa en camino").
 */
export function insertIntoDraft(draft: string, snippet: string, caret: number): DraftInsertion {
  const at = Math.max(0, Math.min(caret, draft.length))
  const before = draft.slice(0, at)
  const after = draft.slice(at)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const trail = after && !/^\s/.test(after) ? ' ' : ''
  const inserted = `${lead}${snippet}${trail}`
  return { text: `${before}${inserted}${after}`, caret: at + lead.length + snippet.length }
}
