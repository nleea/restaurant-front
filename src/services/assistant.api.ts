// Capa tipada del asistente.
//
// Dos permisos y la asimetría importa: preguntar es `assistant.use`, ver el consumo y
// comprar más es `assistant.manage`. El backend lo exige por su cuenta; esto sólo evita
// enseñar botones que van a dar 403.
import { http } from '@/lib/http'

export interface AskResponse {
  text: string
  model: string
  tokens_in: number
  tokens_out: number
  /** Lo que se le descuenta al saldo del negocio por esta respuesta. */
  billed_units: number
}

export interface AssistantUsage {
  /** Sin derecho el asistente no existe para este negocio: no es un límite, es que no se compró. */
  entitled: boolean
  is_enabled: boolean
  plan: string
  quota_units: number
  used_units: number
  remaining_units: number
  used_percent: number
  exhausted: boolean
  warning_threshold_percent: number
  period_start: string | null
  period_end: string | null
  /** Lo que nos costó a NOSOTROS. Sólo lo ve quien administra. */
  provider_cost: string
}

export interface UsageEntry {
  occurred_at: string
  caller_kind: 'customer' | 'employee'
  model: string
  tokens_in: number
  tokens_out: number
  billed_units: number
  provider_cost: string
}

export interface AssistantPlan {
  name: string
  max_input_tokens: number
  max_output_tokens: number
}

export interface SaveEntitlementRequest {
  plan: string
  is_enabled: boolean
  monthly_quota_units: number
  warning_threshold_percent: number
  fallback_message: string
}

export async function ask(question: string, branchId: string): Promise<AskResponse> {
  return (await http.post<AskResponse>('/assistant/ask', { question, branch_id: branchId })).data
}

export async function getUsage(): Promise<AssistantUsage> {
  return (await http.get<AssistantUsage>('/assistant/usage')).data
}

export async function listRecentUsage(limit = 20): Promise<UsageEntry[]> {
  return (await http.get<UsageEntry[]>('/assistant/usage/recent', { params: { limit } })).data
}

export async function listPlans(): Promise<AssistantPlan[]> {
  return (await http.get<AssistantPlan[]>('/assistant/plans')).data
}

export async function saveEntitlement(payload: SaveEntitlementRequest): Promise<AssistantUsage> {
  return (await http.put<AssistantUsage>('/assistant/entitlement', payload)).data
}
