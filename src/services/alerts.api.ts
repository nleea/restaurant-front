// Capa tipada del módulo de alertas.
//
// Todo va con `branch_id`: una alerta es de una cocina concreta, y ver las de otra sede no
// es información aquí, es ruido. Ver y tomar piden `alerts.read` (es el turno); configurar
// umbrales y escalados pide `alerts.manage` (es el dueño). El backend lo exige por su cuenta.
import { http } from '@/lib/http'

export type AlertStatus = 'fired' | 'acknowledged' | 'resolved'

/** Las reglas que existen. La de cuota la añadió `assistant-core` sobre la misma máquina. */
export type RuleKey =
  | 'low_stock'
  | 'whatsapp_session_down'
  | 'cash_session_left_open'
  | 'assistant_quota'

export interface Alert {
  id: string
  rule_key: RuleKey
  /** De quién habla: el insumo, la sesión o la caja. */
  subject_ref: string
  /** Cómo se llama ("Azúcar"). `null` sólo en alertas viejas — entonces se cae en la ref. */
  subject_label: string | null
  status: AlertStatus
  fired_at: string | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  /** Quién la tiene, ya resuelto: para que el segundo en verla no repita el trabajo. */
  holder_name: string | null
  /** La ÚLTIMA vez que salió por WhatsApp, no "si salió": el escalado se repite cada 4 horas. */
  last_escalated_at: string | null
  /**
   * Puesta = alguien dijo "ya lo sé, cállate".
   *
   * Sigue abierta y **sin dueño**: se pinta distinto de una tomada, porque silenciar no afirma
   * que nadie se haga cargo. Si callar exigiera tomar, el panel se llenaría de dueños falsos.
   */
  reminders_muted_at: string | null
}

export interface AlertRule {
  rule_key: RuleKey
  is_enabled: boolean
  /** Su significado lo pone cada regla; la de stock bajo no lo usa. */
  threshold: number | null
  /** Cuánto hay que recuperarse por encima del umbral para volver a poder avisar. */
  recovery_buffer: number
  /** Cada cuánto insiste el PANEL mientras nadie la toque. `0` = avisa una vez y calla. */
  remind_every_minutes: number
  /** Cuándo sale el PRIMER WhatsApp. Los siguientes van cada 4 h, y eso no es configurable. */
  escalation_after_minutes: number
  escalate_to_whatsapp: boolean
}

export async function listAlerts(branchId: string): Promise<Alert[]> {
  return (await http.get<Alert[]>('/alerts', { params: { branch_id: branchId } })).data
}

export async function acknowledgeAlert(branchId: string, alertId: string): Promise<Alert> {
  return (
    await http.post<Alert>(`/alerts/${alertId}/acknowledge`, null, {
      params: { branch_id: branchId },
    })
  ).data
}

/**
 * Callar una alerta sin tomarla: "ya lo sé, el proveedor viene el viernes".
 *
 * Deja de recordar SÓLO esta alerta y sólo mientras siga abierta; cuando se resuelva y vuelva a
 * dispararse, la nueva recuerda otra vez. Pide `alerts.read`, igual que tomarla.
 */
export async function muteAlert(branchId: string, alertId: string): Promise<Alert> {
  return (
    await http.post<Alert>(`/alerts/${alertId}/mute`, null, {
      params: { branch_id: branchId },
    })
  ).data
}

export async function listRules(branchId: string): Promise<AlertRule[]> {
  return (await http.get<AlertRule[]>('/alerts/rules', { params: { branch_id: branchId } }))
    .data
}

export async function saveRule(branchId: string, rule: AlertRule): Promise<AlertRule> {
  const { rule_key: ruleKey, ...body } = rule
  return (
    await http.put<AlertRule>(`/alerts/rules/${ruleKey}`, body, {
      params: { branch_id: branchId },
    })
  ).data
}

/** Qué pasaría si una alerta escalara ahora. Es un diagnóstico, no una estadística. */
export interface EscalationReach {
  /** La sucursal tiene número y está conectado. Sin esto, nada más importa. */
  has_session: boolean
  /** Cuántos han sido señalados para recibirlo (y pueden ver alertas). */
  subscribed: number
  /** De los señalados, cuántos tienen un chat de WhatsApp emparejado. */
  with_chat: number
  /** De esos, a cuántos se les puede escribir de verdad (ya escribieron al número). */
  reachable: number
}

export async function getEscalationReach(branchId: string): Promise<EscalationReach> {
  return (
    await http.get<EscalationReach>('/alerts/escalation-reach', {
      params: { branch_id: branchId },
    })
  ).data
}

/** Una persona señalada para recibir alertas, y si de verdad se le puede escribir. */
export interface EscalationRecipient {
  employee_id: string
  name: string
  /** Tiene un chat emparejado. No se deduce del teléfono: con un `@lid` es imposible. */
  has_chat: boolean
  /** Y ese chat sirve para escribir (escribieron ellos primero). */
  reachable: boolean
}

export async function getEscalationRecipients(
  branchId: string,
): Promise<EscalationRecipient[]> {
  return (
    await http.get<EscalationRecipient[]>('/alerts/escalation-recipients', {
      params: { branch_id: branchId },
    })
  ).data
}

/** Un chat al que SE PUEDE escribir: alguien que ya escribió al número del negocio. */
export interface ContactableChat {
  contact_id: string
  /** El nombre que muestra WhatsApp — lo único con lo que reconocerlo. */
  name: string | null
  /** Número o `@lid`, tal y como se le escribiría. */
  address: string
}

export async function getContactableChats(branchId: string): Promise<ContactableChat[]> {
  return (
    await http.get<ContactableChat[]>('/alerts/contactable-chats', {
      params: { branch_id: branchId },
    })
  ).data
}

/** Dice cuál de los chats es esta persona. `null` la desempareja. */
export async function linkRecipientChat(
  branchId: string,
  employeeId: string,
  contactId: string | null,
): Promise<EscalationRecipient> {
  return (
    await http.put<EscalationRecipient>(
      `/alerts/recipients/${employeeId}/chat`,
      { contact_id: contactId },
      { params: { branch_id: branchId } },
    )
  ).data
}
