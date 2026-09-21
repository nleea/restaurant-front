// Lógica pura de las respuestas automáticas de WhatsApp: sustituir marcadores, redactar la
// próxima apertura y contar cuántos mensajes gasta un pedido.
//
// **Es un espejo deliberado del backend** (`messaging/domain/templates.py` y
// `business/domain/hours.py`). Duplicar reglas nunca es gratis, pero la alternativa —pedirle
// al servidor una vista previa por cada tecla— convierte un editor de texto en una pantalla
// que parpadea contra la red. La vista previa es local; la VERDAD sigue siendo del backend,
// que revalida los marcadores al guardar y responde 422 nombrando al culpable. Si los dos
// discrepan, gana el 422: la pantalla se equivocó en el ensayo, no en el envío.
//
// Nada de aquí toca la red, el reloj ni el DOM: quien llama trae los valores.

// --- Marcadores --------------------------------------------------------------
// Qué marcadores existen lo dice el API (`greeting_placeholders` / `order_placeholders`);
// esto sólo sabe reconocerlos y sustituirlos. La lista viaja para que añadir uno en el
// backend no obligue a tocar el front.
const PLACEHOLDER_RE = /\{([a-z_]+)\}/g

/**
 * `menu_link` → `{menu_link}`, para pintarlo.
 *
 * Existe porque escribir las llaves dentro de una interpolación de Vue rompe su parser: la
 * plantilla ve el `}}` de cierre antes de tiempo.
 */
export function braced(placeholder: string): string {
  return `{${placeholder}}`
}

/** `{a}, {b}` — la lista de marcadores tal y como se le enseña a alguien. */
export function bracedList(placeholders: readonly string[]): string {
  return placeholders.map(braced).join(', ')
}

/** Los marcadores que aparecen en el texto, sin juzgarlos. */
export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1] as string)
}

/** Los que el texto usa y no existen — lo que hace fallar el guardado, en orden y sin repetir. */
export function unknownPlaceholders(text: string, allowed: readonly string[]): string[] {
  const known = new Set(allowed)
  return [...new Set(findPlaceholders(text))].filter((name) => !known.has(name))
}

/**
 * Sustituye los marcadores presentes; deja intactos los que no tengan valor.
 *
 * Dejar `{next_opening}` visible cuando no hay dato es feo, pero es honesto y depurable:
 * sustituirlo por vacío produciría frases como "abrimos  " que nadie sabe de dónde salen.
 * El backend hace exactamente esto, así que la vista previa enseña el hueco de verdad.
 */
export function renderTemplate(text: string, values: Record<string, string | undefined>): string {
  return text.replace(PLACEHOLDER_RE, (whole, key: string) => values[key] ?? whole)
}

// --- Textos de fábrica (espejo de `autoreply.py`) -----------------------------
// Se saluda con el nombre del NEGOCIO, no con el de la sucursal: es lo que el dueño rellena
// primero en el Perfil del negocio y como el cliente conoce el sitio. La sucursal se llama
// "Main Branch" hasta que alguien la renombra.
export const DEFAULT_GREETING_OPEN =
  '¡Hola! Bienvenido a {business_name}. 👋\n\nMira nuestra carta y haz tu pedido aquí:\n{menu_link}'
export const DEFAULT_GREETING_CLOSED =
  '¡Hola! Bienvenido a {business_name}. 👋\n\nAhora mismo estamos cerrados — abrimos {next_opening}.\n\nPuedes ir mirando la carta aquí:\n{menu_link}'
export const ASSISTANT_OFFER = '\n\nEscribe *1* si prefieres que te atienda nuestro asistente.'
// El menú de opciones de fábrica. Espejo de `DEFAULT_OPTIONS_MENU` del backend: un campo vacío
// enseña éste, porque es lo que saldrá de verdad por WhatsApp.
//
// Numerado y no una lista con viñetas: los botones interactivos de WhatsApp no existen en un
// puente no oficial, y responder con un número es lo que hace todo el mundo. El backend acepta
// los números sueltos y también las palabras ("pedido", "estado", "persona").
export const DEFAULT_OPTIONS_MENU =
  '¡Con gusto! Dime qué necesitas:\n\n' +
  '*1* — Hacer un pedido nuevo\n' +
  '*2* — Ver cómo va mi pedido\n' +
  '*3* — Hablar con alguien del equipo'

// --- Horarios (espejo de `hours.py`) -----------------------------------------
export interface HoursWindow {
  weekday: number
  openMinute: number
  closeMinute: number
}

const DAYS = 7
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/**
 * El próximo (día, minuto) en que el negocio abre, buscando hasta 7 días.
 *
 * `null` cuando no hay ninguna ventana — una sede sin horarios cargados. Las aperturas de
 * hoy que ya pasaron se saltan.
 */
export function nextOpening(
  windows: readonly HoursWindow[],
  weekday: number,
  minute: number,
): { weekday: number; minute: number } | null {
  if (windows.length === 0) return null
  for (let offset = 0; offset <= DAYS; offset += 1) {
    const day = (weekday + offset) % DAYS
    const floor = offset === 0 ? minute : 0
    const candidates = windows
      .filter((w) => w.weekday === day && w.openMinute >= floor)
      .map((w) => w.openMinute)
      .sort((a, b) => a - b)
    if (candidates.length > 0) return { weekday: day, minute: candidates[0] as number }
  }
  return null
}

/**
 * "mañana a las 8:00", "el jueves a las 10:30". `null` cuando no hay horario.
 *
 * Se dice el día relativo cuando se puede ("hoy"/"mañana") porque es como habla la gente;
 * para más lejos, el nombre del día, que es más útil que "en 4 días".
 */
export function formatNextOpening(
  opening: { weekday: number; minute: number } | null,
  todayWeekday: number,
): string | null {
  if (!opening) return null
  const hour = Math.floor(opening.minute / 60)
  const minutes = String(opening.minute % 60).padStart(2, '0')
  const clock = `${hour}:${minutes}`
  const delta = (opening.weekday - todayWeekday + DAYS) % DAYS
  if (delta === 0) return `hoy a las ${clock}`
  if (delta === 1) return `mañana a las ${clock}`
  return `el ${WEEKDAYS[opening.weekday]} a las ${clock}`
}

// --- Avisos de estado --------------------------------------------------------
/** Las transiciones que pueden hablarle al cliente, en el orden en que le pasan a un pedido. */
export const TRANSITIONS = [
  'order_received',
  'ready',
  'assigned',
  'on_the_way',
  'delivered',
  'cancelled',
] as const
export type Transition = (typeof TRANSITIONS)[number]

/** Cómo se llama cada transición para el dueño, que no piensa en estados sino en momentos. */
export const TRANSITION_LABEL: Record<Transition, string> = {
  order_received: 'Recibimos el pedido',
  ready: 'El pedido está listo',
  assigned: 'Se asignó domiciliario',
  on_the_way: 'El pedido va en camino',
  delivered: 'El pedido se entregó',
  cancelled: 'El pedido se canceló',
}

export const TRANSITION_HINT: Record<Transition, string> = {
  order_received: 'El acuse de recibo. Es el único que casi todo negocio quiere.',
  ready: 'Para recoger en tienda. En domicilio no le dice nada al cliente.',
  assigned: 'Sólo si el cliente sigue la entrega; si no, es ruido antes de "va en camino".',
  on_the_way: 'El aviso que evita la llamada de "¿ya salió?".',
  delivered: 'Cierra la conversación y deja constancia de la entrega.',
  cancelled: 'Nunca dejes que se entere por el silencio.',
}

export interface StatusMessage {
  enabled: boolean
  text: string
}

/**
 * Cuántos mensajes recibe un cliente en un pedido normal.
 *
 * "Normal" = un pedido que llega, se prepara y se entrega. Los cinco estados de ese camino
 * le pasan al MISMO pedido: la cocina lo marca listo también en un domicilio, antes de que
 * salga. `cancelled` queda fuera porque es el otro final —excluye a `delivered`—, y contar
 * los seis daría un número que ningún cliente llega a vivir.
 */
const TYPICAL_FLOW: readonly Transition[] = [
  'order_received',
  'ready',
  'assigned',
  'on_the_way',
  'delivered',
]

/**
 * El techo que nos pusimos: cuatro avisos por pedido.
 *
 * Encender los cinco del recorrido lo pasa, y ahí es donde el volumen de salida empieza a ser
 * lo que hace que WhatsApp mire el número —y que el cliente silencie el chat.
 */
export const RECOMMENDED_MAX_MESSAGES = 4

export function typicalMessageCount(mapping: Record<string, StatusMessage>): number {
  return TYPICAL_FLOW.filter((state) => mapping[state]?.enabled && mapping[state]?.text.trim())
    .length
}

// --- Validación antes de guardar ---------------------------------------------
export interface PlaceholderCheckInput {
  greetingOpenText: string
  greetingClosedText: string
  statusMapping: Record<string, StatusMessage>
  greetingPlaceholders: readonly string[]
  orderPlaceholders: readonly string[]
  /** La tercera variante del saludo y sus marcadores (lleva los del pedido). */
  awaitingText?: string
  awaitingPlaceholders?: readonly string[]
  faqs?: readonly FaqEntry[] | null
  faqPlaceholders?: readonly string[]
  /**
   * El menú de opciones y sus marcadores. Sólo se valida si está ENCENDIDO, por la misma razón
   * que un aviso apagado: un texto que nadie va a mandar no puede bloquear el formulario.
   */
  menuEnabled?: boolean
  menuText?: string
  menuPlaceholders?: readonly string[]
}

/**
 * Los marcadores inválidos de todo el formulario, ya con llaves y sin repetir.
 *
 * El backend rechaza esto con un 422 que nombra al culpable, y ese sigue siendo el juez. Pero
 * dejar que el guardado salga y vuelva rebotado convierte un error de escritura en un viaje
 * de ida y vuelta; con la lista aquí, el botón de guardar se apaga y el dueño ve qué sobra
 * mientras lo escribe. Sólo se miran los avisos ENCENDIDOS: un texto apagado no se envía, y
 * bloquear el formulario por un borrador que nadie va a mandar es una trampa.
 */
export function placeholderErrors(input: PlaceholderCheckInput): string[] {
  const offenders = new Set<string>()
  for (const name of unknownPlaceholders(input.greetingOpenText, input.greetingPlaceholders)) {
    offenders.add(name)
  }
  for (const name of unknownPlaceholders(input.greetingClosedText, input.greetingPlaceholders)) {
    offenders.add(name)
  }
  for (const name of unknownPlaceholders(
    input.awaitingText ?? '',
    input.awaitingPlaceholders ?? [],
  )) {
    offenders.add(name)
  }
  for (const entry of Object.values(input.statusMapping)) {
    if (!entry.enabled) continue
    for (const name of unknownPlaceholders(entry.text, input.orderPlaceholders)) {
      offenders.add(name)
    }
  }
  // Sólo las FAQs ENCENDIDAS, por lo mismo que los avisos: un borrador apagado no se envía, y
  // bloquear el guardado por un texto que nadie va a mandar es una trampa.
  for (const faq of input.faqs ?? []) {
    if (!faq.enabled) continue
    for (const name of unknownPlaceholders(faq.text, input.faqPlaceholders ?? [])) {
      offenders.add(name)
    }
  }
  // El menú, sólo si está encendido. Un texto apagado no sale, y bloquear el guardado por un
  // borrador que nadie va a mandar es la trampa que ya se evita con las FAQs.
  if (input.menuEnabled) {
    for (const name of unknownPlaceholders(input.menuText ?? '', input.menuPlaceholders ?? [])) {
      offenders.add(name)
    }
  }
  return [...offenders].map(braced)
}

// --- FAQs por palabra clave (espejo de `messaging/domain/faq.py`) ------------
/** Igual que en el API. Se declara aquí para que este fichero siga sin importar nada. */
export interface FaqEntry {
  id: string
  name: string
  triggers: string[]
  text: string
  enabled: boolean
}

// Mismo trato que el resto del fichero: la vista previa es local, la VERDAD es del backend.
// Aquí el espejo sirve para que el dueño vea, mientras escribe los gatillos, si la frase que él
// mismo teclearía dispararía la FAQ — sin pedirle una comprobación al servidor por tecla.
//
// Las dos reglas que hay que no romper, porque son lo que separa esto de un keyword-bot de 2010:
// palabra o frase COMPLETA (nunca substring), y plural sí pero *stemming* NO. Si `pago` llega a
// encontrar "ya pagué", el espejo se ha desviado del backend y la pantalla miente.
const NON_ALNUM = /[^0-9a-z]+/g
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Minúsculas, sin tildes, signos a espacio y espacios colapsados. Los DOS lados igual. */
export function normalizeText(text: string): string {
  const withoutMarks = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return withoutMarks.replace(NON_ALNUM, ' ').trim().replace(/\s+/g, ' ')
}

/** El gatillo normalizado, en singular y plural. Nunca recorta más que eso. */
export function pluralVariants(trigger: string): string[] {
  const base = normalizeText(trigger)
  if (!base) return []
  const variants = new Set([base])
  if (base.length > 3 && base.endsWith('es')) variants.add(base.slice(0, -2))
  if (base.length > 2 && base.endsWith('s')) variants.add(base.slice(0, -1))
  if (!base.endsWith('s')) {
    variants.add(`${base}s`)
    if (!VOWELS.has(base[base.length - 1] as string)) variants.add(`${base}es`)
  }
  return [...variants]
}

/** ¿Aparece el gatillo como palabra o frase COMPLETA? El acolchado da el límite de palabra. */
export function triggerMatches(trigger: string, message: string): boolean {
  const padded = ` ${normalizeText(message)} `
  return pluralVariants(trigger).some((variant) => padded.includes(` ${variant} `))
}

/** La primera FAQ encendida cuyo gatillo coincida. El orden de la lista es la prioridad. */
export function firstMatchingFaq(faqs: readonly FaqEntry[], message: string): FaqEntry | null {
  for (const faq of faqs) {
    if (!faq.enabled || !faq.text.trim()) continue
    if (faq.triggers.some((trigger) => triggerMatches(trigger, message))) return faq
  }
  return null
}

/**
 * Las FAQs vigentes: las guardadas, o las sugeridas si el tenant nunca las tocó.
 *
 * **`null` no es `[]`**, y aquí está todo el asunto. `null` = nunca las configuró → se le
 * ofrecen las sugeridas (que llegan apagadas del backend). `[]` = las borró → se respeta.
 *
 * Deliberadamente NO se parece a `materialize` del mapeo de estados: ese fusiona lo guardado
 * sobre unos valores de fábrica clave a clave, lo que aquí haría que una FAQ borrada volviera en
 * la siguiente carga. El mapeo tiene seis claves fijas; esta lista es propiedad del dueño.
 */
export function materializeFaqs(
  saved: readonly FaqEntry[] | null,
  suggested: readonly FaqEntry[],
): FaqEntry[] {
  const source = saved ?? suggested
  return source.map((faq) => ({ ...faq, triggers: [...faq.triggers] }))
}

/** Mueve una FAQ un puesto arriba o abajo. Devuelve una lista nueva; en los extremos, la misma. */
export function moveFaq(faqs: readonly FaqEntry[], index: number, delta: -1 | 1): FaqEntry[] {
  const target = index + delta
  if (index < 0 || index >= faqs.length || target < 0 || target >= faqs.length) return [...faqs]
  const next = [...faqs]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved as FaqEntry)
  return next
}

// --- Vista previa del saludo -------------------------------------------------
/** La identidad del negocio, tal y como la dejó el Perfil del negocio. */
export interface BusinessIdentity {
  businessName: string
  branchName: string
  branchAddress?: string
  branchPhone?: string
}

export interface GreetingPreviewInput extends BusinessIdentity {
  template: string
  menuLink: string
  /** Ya redactado ("mañana a las 8:00"); `undefined` deja el marcador a la vista. */
  nextOpeningLabel?: string
  assistantOffer: boolean
}

/**
 * La identidad lista para interpolar, con los huecos FUERA del diccionario.
 *
 * Un dato vacío se omite en vez de mandarse como "": `renderTemplate` deja entonces el
 * marcador a la vista, que es feo pero dice dónde está el hueco. Sustituirlo por vacío
 * produciría "Llámanos al " y nadie sabría de dónde salió. Es lo que hace el backend.
 */
export function identityValues(identity: BusinessIdentity): Record<string, string> {
  const values: Record<string, string> = {
    business_name: identity.businessName,
    branch_name: identity.branchName,
    branch_address: identity.branchAddress ?? '',
    branch_phone: identity.branchPhone ?? '',
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value))
}

/** El saludo tal y como saldría por WhatsApp, con la oferta del asistente si procede. */
export function previewGreeting(input: GreetingPreviewInput): string {
  const text = renderTemplate(input.template, {
    ...identityValues(input),
    menu_link: input.menuLink,
    next_opening: input.nextOpeningLabel,
  })
  return input.assistantOffer ? text + ASSISTANT_OFFER : text
}

export interface MenuPreviewInput extends BusinessIdentity {
  template: string
  menuLink: string
}

/**
 * El menú de opciones tal y como saldría. Igual que el backend: identidad + `{menu_link}`.
 *
 * El texto de fábrica no usa `{menu_link}` —la opción "pedido" manda el enlace por separado—,
 * pero un tenant que lo escriba sí puede, así que se resuelve igual.
 */
export function previewMenu(input: MenuPreviewInput): string {
  return renderTemplate(input.template, {
    ...identityValues(input),
    menu_link: input.menuLink,
  })
}
