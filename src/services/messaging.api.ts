// Typed Messaging API layer (WhatsApp inbox + per-branch sessions).
//
// Every inbox call carries `branch_id`: the customer chose the branch by choosing the
// number they wrote to, so a conversation only exists within one branch's inbox.
// Reads need `messaging.read`, acting needs `messaging.attend`, pairing `messaging.manage`.
import { http } from '@/lib/http'

export type ConversationStatus = 'new' | 'human' | 'closed'
export type SenderType = 'contact' | 'employee' | 'system'
/**
 * Hasta dónde llegó un mensaje nuestro.
 *
 * `pending → sent` los pone el envío; `delivered → read` los ponen los acuses del proveedor, y
 * **sólo suben**: un acuse tardío no puede apagar una palomita ya ganada. `failed` está fuera de
 * esa escala — es el otro final.
 */
export type DeliveryState = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
export type SessionStatus = 'disconnected' | 'qr_pending' | 'connected' | 'banned'

export interface Conversation {
  id: string
  branch_id: string
  contact_id: string
  contact_name: string | null
  contact_phone: string
  status: ConversationStatus
  employee_id: string | null
  holder_name: string | null
  started_at: string
  closed_at: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_message_sender_type: SenderType | null
  message_count: number
  /** The contact spoke last — somebody owes them an answer. */
  awaiting_reply: boolean
}

export interface Message {
  id: string
  sender_type: SenderType
  employee_id: string | null
  content: string
  delivery_state: DeliveryState
  sent_at: string
  /**
   * Qué clase de archivo traía (`image` / `document`), **aunque no se haya podido guardar**.
   * `media_type` con `media_url` en null significa "llegó un archivo y no se pudo traer": es un
   * estado legítimo y el hilo tiene que contarlo, no dejar un hueco.
   */
  media_type: MediaType | null
  media_mime: string | null
  media_url: string | null
  /** La etiqueta del pedido del que este archivo ya es comprobante, si lo es. */
  proof_of_order: string | null
}

export type MediaType = 'image' | 'document'

/** Lo que el puente sabe mandar y R2 sabe guardar. Espejo de `messaging/domain/media.py`. */
export const SENDABLE_TYPES = 'image/png,image/jpeg,image/webp,application/pdf'
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024

/** Manda un archivo por el chat y devuelve el hilo releído, con el mensaje ya dentro. */
export async function sendMedia(
  branchId: string,
  conversationId: string,
  file: File,
  caption: string,
): Promise<Thread> {
  const form = new FormData()
  form.append('file', file)
  form.append('caption', caption)
  const { data } = await http.post<Thread>(
    `/messaging/conversations/${conversationId}/media`,
    form,
    { params: { branch_id: branchId } },
  )
  return data
}

/** Un pedido de ese contacto al que se le puede pegar un comprobante. */
export interface EligibleOrder {
  order_id: string
  number: string
  total: string
  balance: string
}

export async function getEligibleOrders(
  conversationId: string,
  branchId: string,
): Promise<EligibleOrder[]> {
  const { data } = await http.get<EligibleOrder[]>(
    `/messaging/conversations/${conversationId}/eligible-orders`,
    { params: { branch_id: branchId } },
  )
  return data
}

/**
 * Usa el archivo de un mensaje como comprobante de un pedido.
 *
 * Exige `orders.pay`, no `messaging.attend`: crear un claim es un paso del camino del dinero.
 */
export async function useMessageAsProof(
  conversationId: string,
  messageId: string,
  branchId: string,
  orderId: string,
  amount: string,
): Promise<void> {
  await http.post(
    `/messaging/conversations/${conversationId}/messages/${messageId}/use-as-proof`,
    { order_id: orderId, amount },
    { params: { branch_id: branchId } },
  )
}

export interface Thread {
  id: string
  branch_id: string
  contact_id: string
  contact_name: string | null
  contact_phone: string
  /**
   * Si este contacto pidió no recibir estados.
   *
   * Viaja en el hilo y no en la lista de la bandeja porque el interruptor vive en el hilo: es
   * donde llega la petición y donde está quien la lee.
   */
  contact_status_opt_out: boolean
  status: ConversationStatus
  employee_id: string | null
  holder_name: string | null
  started_at: string
  closed_at: string | null
  messages: Message[]
}

export interface WhatsAppSession {
  id: string
  branch_id: string
  provider_instance_ref: string
  status: SessionStatus
  phone_number: string | null
  last_seen_at: string | null
}

// --- Inbox ------------------------------------------------------------------
export async function listConversations(
  branchId: string,
  includeClosed = false,
): Promise<Conversation[]> {
  return (
    await http.get<Conversation[]>('/messaging/conversations', {
      params: { branch_id: branchId, include_closed: includeClosed },
    })
  ).data
}

export async function getThread(branchId: string, conversationId: string): Promise<Thread> {
  return (
    await http.get<Thread>(`/messaging/conversations/${conversationId}`, {
      params: { branch_id: branchId },
    })
  ).data
}

export async function claimConversation(
  branchId: string,
  conversationId: string,
): Promise<Thread> {
  return (
    await http.post<Thread>(
      `/messaging/conversations/${conversationId}/claim`,
      null,
      { params: { branch_id: branchId } },
    )
  ).data
}

export async function sendReply(
  branchId: string,
  conversationId: string,
  body: string,
): Promise<Thread> {
  return (
    await http.post<Thread>(
      `/messaging/conversations/${conversationId}/messages`,
      { body },
      { params: { branch_id: branchId } },
    )
  ).data
}

export async function closeConversation(
  branchId: string,
  conversationId: string,
): Promise<Thread> {
  return (
    await http.post<Thread>(
      `/messaging/conversations/${conversationId}/close`,
      null,
      { params: { branch_id: branchId } },
    )
  ).data
}

// --- Sessions ---------------------------------------------------------------
export async function listSessions(): Promise<WhatsAppSession[]> {
  return (await http.get<WhatsAppSession[]>('/messaging/sessions')).data
}

export async function createSession(
  branchId: string,
  providerInstanceRef: string,
): Promise<WhatsAppSession> {
  return (
    await http.post<WhatsAppSession>('/messaging/sessions', {
      branch_id: branchId,
      provider_instance_ref: providerInstanceRef,
    })
  ).data
}

/** La sesión más el QR a escanear. `qr` es null cuando el número ya está conectado. */
export interface PairingResult {
  session: WhatsAppSession
  /** PNG en data-URI, listo para un `<img src>`. */
  qr: string | null
}

export async function startPairing(sessionId: string): Promise<PairingResult> {
  return (await http.post<PairingResult>(`/messaging/sessions/${sessionId}/pair`)).data
}

// --- Autoreply settings -----------------------------------------------------
// Cero LLM: el saludo y los avisos de estado son texto determinista sobre datos que el
// sistema ya tiene. Todo esto es tenant-level (un saludo, N sucursales) y pide
// `messaging.manage`; el backend lo exige por su cuenta.
export interface StatusMessage {
  enabled: boolean
  text: string
}

/**
 * Una FAQ por palabra clave. El ORDEN del array es la prioridad de coincidencia: si un mensaje
 * matchea varias, gana la primera. Por eso no hay campo de posición — la posición es el índice.
 */
export interface FaqEntry {
  id: string
  name: string
  triggers: string[]
  text: string
  enabled: boolean
}

/**
 * Una plantilla que un empleado inserta en el compositor. **No contesta sola nunca.**
 *
 * Sin `enabled` ni `triggers`, al contrario que `FaqEntry`: los dos sólo significan algo cuando
 * algo lee el mensaje del cliente y decide contestar, y aquí decide una persona.
 */
export interface QuickReply {
  id: string
  name: string
  text: string
}

export interface AutoreplySettings {
  greeting_enabled: boolean
  greeting_open_text: string
  greeting_closed_text: string
  /** Tercera variante: el contacto tiene un pedido prepago sin pagar. Vacía = usar las otras. */
  greeting_awaiting_payment_text: string
  assistant_offer_enabled: boolean
  /**
   * El menú de opciones que sale cuando el saludo, el asistente y las FAQs no contestan.
   *
   * Existe para que un mensaje no entendido en un chat abierto no se quede sin respuesta: al
   * cliente el silencio le parece un desplante. Sale una vez por conversación, sólo en chat
   * abierto y con el negocio abierto.
   */
  menu_enabled: boolean
  /** Texto del menú. Vacío = usa el de fábrica que envía el backend. */
  menu_text: string
  /** Tras cuántas horas de silencio se cierra la conversación — y se vuelve a saludar. */
  idle_hours: number
  /** Cuánto vive el token del enlace a la carta. */
  token_lifetime_hours: number
  status_mapping: Record<string, StatusMessage>
  /**
   * `null` y `[]` NO significan lo mismo, y de eso depende que una FAQ borrada no resucite:
   * `null` es "este tenant nunca las tocó" (se le ofrecen las sugeridas, apagadas) y `[]` es
   * "decidió que ninguna". Fusionar lo guardado sobre unos valores de fábrica —como se hace con
   * `status_mapping`, que tiene claves fijas— aquí sería el bug.
   */
  faqs: FaqEntry[] | null
  /** Mismo `null` ≠ `[]` que `faqs`: aquí el que resucitaría es una plantilla borrada. */
  quick_replies: QuickReply[] | null
}

/** Los ajustes vigentes más lo que la pantalla necesita para editarlos sin adivinar. */
export interface AutoreplyDefaults {
  settings: AutoreplySettings
  /** El mapeo de fábrica, para poder ofrecer "restaurar" sin inventárselo. */
  default_status_mapping: Record<string, StatusMessage>
  /** Las cuatro sugeridas, APAGADAS: para "Restaurar sugeridas" y para el tenant en `null`. */
  suggested_faqs: FaqEntry[]
  /** Las plantillas sugeridas, para el tenant en `null`. Adoptarlas NO guarda. */
  suggested_quick_replies: QuickReply[]
  greeting_placeholders: string[]
  order_placeholders: string[]
  faq_placeholders: string[]
  awaiting_payment_placeholders: string[]
  menu_placeholders: string[]
  /** El texto de fábrica del menú, para el campo vacío y la vista previa. */
  default_menu_text: string
  /** Si el asistente conversacional existe. Falso hasta `assistant-core` (fase 4). */
  assistant_available: boolean
}

export async function getAutoreplySettings(): Promise<AutoreplyDefaults> {
  return (await http.get<AutoreplyDefaults>('/messaging/autoreply')).data
}

export async function saveAutoreplySettings(
  settings: AutoreplySettings,
): Promise<AutoreplySettings> {
  return (await http.put<AutoreplySettings>('/messaging/autoreply', settings)).data
}

/**
 * Las plantillas del tenant, para el compositor del inbox.
 *
 * Endpoint propio y no `getAutoreplySettings` porque aquél exige `messaging.manage` y devuelve
 * el saludo entero; quien atiende el chat en hora punta sólo tiene `messaging.attend`. Devuelve
 * lo GUARDADO: las sugeridas son cosa del editor.
 */
export async function getQuickReplies(): Promise<QuickReply[]> {
  const { data } = await http.get<{ quick_replies: QuickReply[] }>('/messaging/quick-replies')
  return data.quick_replies
}

// --- Estados programados ------------------------------------------------------
// Publicar un estado NO es mandar un mensaje, y el contrato lo refleja de dos formas que
// conviene no "arreglar":
//
// 1. **Un estado de texto lleva color de fondo y fuente**, porque WhatsApp los exige (400 sin
//    ellos). No son decoración: son la razón de que un estado se COMPONGA en vez de escribirse,
//    y de que la vista previa tenga que pintarlos de verdad.
// 2. **No existe ningún campo de vistas ni de entregados**, y no puede existir. El proveedor no
//    devuelve espectadores y devuelve 201 aunque se le caigan tandas de destinatarios. Lo más
//    fuerte que se puede afirmar es "publicado" y "enviado a N". Si algún día alguien añade
//    `views` aquí, será mentira.

export type StatusType = 'text' | 'image'

/** Cómo acabó una franja vencida. Cuatro finales, y los dos "omitido" son distintos. */
export type PublicationState =
  | 'published'
  | 'failed'
  /** Venció fuera de la ventana de gracia: un estado caduca a las 24h, sacarlo tarde es peor. */
  | 'skipped_late'
  /** No quedó nadie tras las cuatro reducciones. Nada se rompió; no había a quién. */
  | 'skipped_empty'

/**
 * Una ocasión en la que el estado se publica: un día de la semana O una fecha, más la hora.
 *
 * `minute` son minutos desde medianoche en hora LOCAL de la sede. Exactamente uno de
 * `weekday` / `on_date` va puesto — y por eso **no hay ningún campo de recurrencia**: marcar
 * los siete días ES "todos los días", y un `kind` aparte sería un segundo sitio decidiendo el
 * mismo hecho, capaz de contradecir a sus propias franjas.
 */
export interface StatusSlot {
  minute: number
  /** 0=lunes … 6=domingo. Nulo cuando la franja es de una fecha concreta. */
  weekday: number | null
  /** `YYYY-MM-DD`. Nulo cuando la franja es semanal. */
  on_date: string | null
}

export interface WhatsAppStatus {
  id: string
  branch_id: string
  type: StatusType
  /** El texto de la tarjeta, o la URL de la imagen. */
  content: string
  slots: StatusSlot[]
  /** Obligatorios para `text` (WhatsApp los exige); nulos para `image`. */
  bg_color: string | null
  font: number | null
  caption: string | null
  media_url: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface StatusDraft {
  type: StatusType
  content: string
  slots: StatusSlot[]
  bg_color: string | null
  font: number | null
  caption: string | null
  media_url: string | null
  active: boolean
}

/**
 * La audiencia y el porqué de cada baja, para enseñarla ANTES de programar.
 *
 * Las cuatro exclusiones van sueltas y no sumadas a propósito: un total no responde la única
 * pregunta que importa —*por qué* bajó de 340 a 200— y `excluded_by_cap > 0` es lo único que
 * distingue "esto llega a todos los que puede" de "esto se truncó".
 */
export interface AudiencePreview {
  /** A cuántos se DIRIGIRÍA. No a cuántos llegaría: eso no se puede saber. */
  addressed: number
  total_candidates: number
  /** Contactos que sólo tienen un JID de privacidad (`@lid`). No reciben estados. */
  excluded_no_number: number
  excluded_opted_out: number
  excluded_inactive: number
  excluded_by_cap: number
  /** Cuántas llamadas al proveedor costaría. Es el número que mide el riesgo. */
  provider_calls: number
}

export interface StatusPublication {
  id: string
  fired_for_date: string
  minute: number
  state: PublicationState
  /** A cuántos se dirigió. **Nunca** "a cuántos llegó". */
  addressed_count: number
  excluded_no_number: number
  excluded_opted_out: number
  excluded_inactive: number
  excluded_by_cap: number
  late_by_minutes: number
  created_at: string
}

export async function listStatuses(branchId: string): Promise<WhatsAppStatus[]> {
  return (
    await http.get<WhatsAppStatus[]>('/messaging/statuses', {
      params: { branch_id: branchId },
    })
  ).data
}

export async function previewStatusAudience(
  branchId: string,
): Promise<AudiencePreview> {
  return (
    await http.get<AudiencePreview>('/messaging/statuses/audience', {
      params: { branch_id: branchId },
    })
  ).data
}

export async function createStatus(
  branchId: string,
  draft: StatusDraft,
): Promise<WhatsAppStatus> {
  return (
    await http.post<WhatsAppStatus>('/messaging/statuses', draft, {
      params: { branch_id: branchId },
    })
  ).data
}

export async function updateStatus(
  branchId: string,
  statusId: string,
  draft: StatusDraft,
): Promise<WhatsAppStatus> {
  return (
    await http.put<WhatsAppStatus>(`/messaging/statuses/${statusId}`, draft, {
      params: { branch_id: branchId },
    })
  ).data
}

export async function deleteStatus(
  branchId: string,
  statusId: string,
): Promise<void> {
  await http.delete(`/messaging/statuses/${statusId}`, {
    params: { branch_id: branchId },
  })
}

export async function listStatusPublications(
  branchId: string,
  statusId: string,
): Promise<StatusPublication[]> {
  return (
    await http.get<StatusPublication[]>(
      `/messaging/statuses/${statusId}/publications`,
      { params: { branch_id: branchId } },
    )
  ).data
}

export async function uploadStatusImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  return (
    await http.post<{ url: string }>('/messaging/statuses/image', form)
  ).data.url
}

/**
 * "Este contacto no quiere estados", desde el hilo donde lo pidió.
 *
 * Se entra por la CONVERSACIÓN y necesita `messaging.attend`, no `manage`: la petición llega en
 * el chat y quien la lee es quien atiende. La marca, en cambio, es del contacto y aplica a todas
 * las sedes — "no me manden más" se le pide al negocio, no a una sucursal.
 */
export async function setStatusOptOut(
  branchId: string,
  conversationId: string,
  optedOut: boolean,
): Promise<Thread> {
  return (
    await http.put<Thread>(
      `/messaging/conversations/${conversationId}/status-opt-out`,
      { opted_out: optedOut },
      { params: { branch_id: branchId } },
    )
  ).data
}
