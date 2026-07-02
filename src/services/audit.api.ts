// Typed Audit API layer over the read-only `/audit` endpoints. The audit log is append-only and
// system-authored — there are no write endpoints. Reads require `audit.read`. The list is ordered
// newest-first and paginated by limit/offset (no total in the response). Entries carry only
// `actor_id`; names are resolved best-effort in the store (via /rbac/users when permitted).
import { http } from '@/lib/http'

export interface AuditLog {
  id: string
  action: string
  actor_id: string | null
  branch_id: string | null
  entity_type: string | null
  entity_id: string | null
  ip: string | null
  detail: string | null
  created_at: string | null
}

export interface AuditFilters {
  action?: string | null
  actor_id?: string | null
  entity_type?: string | null
  entity_id?: string | null
  branch_id?: string | null
  limit: number
  offset: number
}

export async function listLogs(filters: AuditFilters): Promise<AuditLog[]> {
  // Send limit/offset always; include a filter only when it has a value.
  const params: Record<string, string | number> = {
    limit: filters.limit,
    offset: filters.offset,
  }
  if (filters.action) params.action = filters.action
  if (filters.actor_id) params.actor_id = filters.actor_id
  if (filters.entity_type) params.entity_type = filters.entity_type
  if (filters.entity_id) params.entity_id = filters.entity_id
  if (filters.branch_id) params.branch_id = filters.branch_id
  return (await http.get<AuditLog[]>('/audit/logs', { params })).data
}

export async function getLog(id: string): Promise<AuditLog> {
  return (await http.get<AuditLog>(`/audit/logs/${id}`)).data
}
