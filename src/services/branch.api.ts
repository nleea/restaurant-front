// Typed branch directory API over the foundation's Axios instance. `GET /branches` is
// authenticated-only (no RBAC code) and returns the active branches of the tenant resolved
// from the Host subdomain.
import { http } from '@/lib/http'

export interface BranchSummary {
  id: string
  code: string
  name: string
  is_primary: boolean
}

export async function listBranches(): Promise<BranchSummary[]> {
  const { data } = await http.get<BranchSummary[]>('/branches')
  return data
}
