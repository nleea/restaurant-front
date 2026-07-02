// Typed Staff API layer over the foundation's Axios instance. Reads require `staff.read`,
// writes `staff.manage`. Employee responses are raw UUIDs (branch/person/user/role) — the
// store resolves them into labels via rbac.api (users, roles) and the branch context.
//
// Provisioning a brand-new employee is a two-step flow because the backend exposes no single
// "onboard" endpoint: first create the user+person (`POST /rbac/users`, provisionUser), then
// link the employee (`POST /staff/employees`, createEmployee).
import { http } from '@/lib/http'

export interface Employee {
  id: string
  branch_id: string
  person_id: string
  user_id: string
  role_id: string
  hired_at: string | null
  is_active: boolean
}

export interface PlannedShift {
  id: string
  branch_id: string
  employee_id: string
  shift_date: string
  start_time: string
  end_time: string
}

export interface ProvisionedUser {
  id: string
  email: string
  name: string
  is_active: boolean
  person_id: string
}

export interface ProvisionUserInput {
  first_name: string
  last_name: string
  email: string
  password: string
  document_number?: string | null
  phone?: string | null
  role_id?: string | null
}

export interface ShiftInput {
  shift_date: string
  start_time: string
  end_time: string
}

// --- User provisioning (identity) ----------------------------------------------------------
export async function provisionUser(input: ProvisionUserInput): Promise<ProvisionedUser> {
  return (await http.post<ProvisionedUser>('/rbac/users', input)).data
}

// --- Employees -----------------------------------------------------------------------------
export async function listEmployees(params: {
  branchId?: string
  active?: boolean
} = {}): Promise<Employee[]> {
  const query: Record<string, string> = {}
  if (params.branchId) query.branch_id = params.branchId
  if (params.active !== undefined) query.active = String(params.active)
  return (await http.get<Employee[]>('/staff/employees', { params: query })).data
}

export async function getEmployee(id: string): Promise<Employee> {
  return (await http.get<Employee>(`/staff/employees/${id}`)).data
}

export async function createEmployee(input: {
  branch_id: string
  person_id: string
  user_id: string
  role_id: string
}): Promise<Employee> {
  return (await http.post<Employee>('/staff/employees', input)).data
}

export async function updateEmployeeRole(id: string, roleId: string): Promise<Employee> {
  return (await http.patch<Employee>(`/staff/employees/${id}/role`, { role_id: roleId })).data
}

export async function deactivateEmployee(id: string): Promise<Employee> {
  return (await http.delete<Employee>(`/staff/employees/${id}`)).data
}

// --- Planned shifts ------------------------------------------------------------------------
export async function listShifts(employeeId: string): Promise<PlannedShift[]> {
  return (await http.get<PlannedShift[]>(`/staff/employees/${employeeId}/shifts`)).data
}

export async function createShift(
  employeeId: string,
  input: ShiftInput,
): Promise<PlannedShift> {
  return (await http.post<PlannedShift>(`/staff/employees/${employeeId}/shifts`, input)).data
}

export async function updateShift(
  shiftId: string,
  patch: Partial<ShiftInput>,
): Promise<PlannedShift> {
  return (await http.patch<PlannedShift>(`/staff/shifts/${shiftId}`, patch)).data
}

export async function deleteShift(shiftId: string): Promise<void> {
  await http.delete(`/staff/shifts/${shiftId}`)
}
