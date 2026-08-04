// Cómo se llama y cuánto lleva esperando alguien que escribió por WhatsApp.
//
// Lógica pura: sin red, sin DOM. Vive aparte porque la usan la lista, el header del chat y
// cualquier sitio que nombre a un contacto — y porque el caso feo tiene una razón de fondo que hay
// que contar UNA vez.

/**
 * WhatsApp no siempre da un teléfono. Cuando el usuario tiene la privacidad activada manda un
 * `@lid`, un identificador que **no es un número** y que el backend guarda ENTERO a propósito: es
 * lo único con lo que se le puede responder (quitarle el sufijo deja una cifra sin sentido y el
 * puente escribiría a un usuario inexistente).
 *
 * El precio es que de esos contactos no sabemos quién son. Enseñarlo como nombre —
 * `196125537607835@lid` en la cabecera de la conversación— convierte esa verdad en algo que parece
 * un fallo de la aplicación.
 */
export function isPrivacyId(phone: string): boolean {
  return phone.endsWith('@lid')
}

/** `573001112233` → `+57 300 111 2233`. Lo que un humano lee en voz alta. */
export function formatPhone(phone: string): string {
  if (isPrivacyId(phone)) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('57')) {
    const n = digits.slice(2)
    return `+57 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  return phone
}

/**
 * Cómo se llama esta conversación en la lista y en el header.
 *
 * Sin nombre y sin teléfono de verdad, se dice **"Sin nombre"** con los últimos cuatro dígitos
 * como desempate. Es menos información que el identificador entero y es más útil: distingue dos
 * conversaciones sin fingir que ese número significa algo.
 */
export function contactLabel(name: string | null, phone: string): string {
  if (name?.trim()) return name.trim()
  if (isPrivacyId(phone)) return `Sin nombre · ${phone.replace('@lid', '').slice(-4)}`
  return formatPhone(phone)
}

/** El subtítulo: el teléfono si lo hay, y si no, por qué no lo hay. */
export function contactSubtitle(phone: string): string {
  return isPrivacyId(phone) ? 'Número oculto por el cliente' : formatPhone(phone)
}

/** Iniciales para el disco. Con `@lid` no hay iniciales que valgan: se usa un guion. */
export function contactInitials(name: string | null, phone: string): string {
  if (name?.trim()) {
    const [first, second] = name.trim().split(/\s+/)
    return ((first?.[0] ?? '') + (second?.[0] ?? '')).toUpperCase() || '?'
  }
  return isPrivacyId(phone) ? '—' : phone.replace(/\D/g, '').slice(-2)
}

// --- El calor de la espera ---------------------------------------------------
/**
 * Cuánto "quema" una conversación que espera respuesta, de 0 a 1.
 *
 * Es la firma de esta pantalla y no es decoración: el propio comentario de la lista dice que un
 * WhatsApp sin contestar es lo único aquí con un coste pegado. El proyecto ya usa calor para la
 * espera en Despacho, así que esto habla el mismo idioma.
 *
 * Devuelve 0 cuando no es nuestro turno — un hilo contestado no quema por muy viejo que sea.
 */
export const HEAT_FULL_MINUTES = 60

export function waitingHeat(
  awaitingReply: boolean,
  lastMessageAt: string | null,
  now: Date = new Date(),
): number {
  if (!awaitingReply || !lastMessageAt) return 0
  const minutes = (now.getTime() - new Date(lastMessageAt).getTime()) / 60000
  if (minutes <= 0) return 0.08
  return Math.min(1, minutes / HEAT_FULL_MINUTES)
}

/** "2 h esperando" / "8 min esperando". Vacío cuando no es nuestro turno. */
export function waitingLabel(
  awaitingReply: boolean,
  lastMessageAt: string | null,
  now: Date = new Date(),
): string {
  if (!awaitingReply || !lastMessageAt) return ''
  const minutes = Math.floor((now.getTime() - new Date(lastMessageAt).getTime()) / 60000)
  if (minutes < 1) return 'Ahora mismo'
  if (minutes < 60) return `${minutes} min esperando`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h esperando`
  return `${Math.floor(hours / 24)} d esperando`
}
