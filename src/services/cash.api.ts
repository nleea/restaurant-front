// Typed Cash (caja / arqueo) API layer over the foundation's Axios instance. Reads require
// `cash.read`; opening a session requires `cash.open`, registering movements `cash.move`, and
// closing (the arqueo) `cash.close`. Money fields are server-side decimals serialized as strings
// ("23900.00") and are kept verbatim in transit — only the display layer (formatCOP) reformats.
import { http } from '@/lib/http'

export const MOVEMENT_TYPES = ['in', 'out'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export interface CashSession {
  id: string
  branch_id: string
  opened_by_employee_id: string
  opening_amount: string
  status: string
  opened_at: string | null
  closed_by_employee_id: string | null
  counted_amount: string | null
  expected_amount: string | null
  difference: string | null
  closed_at: string | null
}

export interface CashMovement {
  id: string
  branch_id: string
  cash_session_id: string
  type: MovementType
  concept: string
  amount: string
  method: string
  reference_id: string | null
}

export interface OpenSessionInput {
  branch_id: string
  opened_by_employee_id: string
  opening_amount: string
}

export interface CloseSessionInput {
  closed_by_employee_id: string
  counted_amount: string
}

export interface RegisterMovementInput {
  type: MovementType
  concept: string
  amount: string
  method: string
  reference_id?: string | null
}

// --- Sessions ------------------------------------------------------------------------------
export async function openSession(input: OpenSessionInput): Promise<CashSession> {
  return (await http.post<CashSession>('/cash/sessions', input)).data
}

export async function listSessions(branchId: string, status?: string): Promise<CashSession[]> {
  const params: Record<string, string> = { branch_id: branchId }
  if (status) params.status_filter = status
  return (await http.get<CashSession[]>('/cash/sessions', { params })).data
}

export async function getOpenSession(branchId: string): Promise<CashSession> {
  return (await http.get<CashSession>(`/cash/branches/${branchId}/open-session`)).data
}

export async function getSession(sessionId: string): Promise<CashSession> {
  return (await http.get<CashSession>(`/cash/sessions/${sessionId}`)).data
}

export async function closeSession(
  sessionId: string,
  input: CloseSessionInput,
): Promise<CashSession> {
  return (await http.post<CashSession>(`/cash/sessions/${sessionId}/close`, input)).data
}

// --- Movements -----------------------------------------------------------------------------
export async function registerMovement(
  sessionId: string,
  input: RegisterMovementInput,
): Promise<CashMovement> {
  return (await http.post<CashMovement>(`/cash/sessions/${sessionId}/movements`, input)).data
}

export async function listMovements(sessionId: string): Promise<CashMovement[]> {
  return (await http.get<CashMovement[]>(`/cash/sessions/${sessionId}/movements`)).data
}
