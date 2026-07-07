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

export type ShiftStatus = 'scheduled' | 'day_off' | 'covered' | 'manual'
export type ShiftOrigin = 'template' | 'manual' | 'coverage'

export interface PlannedShift {
  id: string
  branch_id: string
  employee_id: string
  shift_date: string
  start_time: string
  end_time: string
  status: ShiftStatus
  origin: ShiftOrigin
  covered_by_employee_id: string | null
  note: string | null
}

export interface ShiftTemplate {
  id: string
  branch_id: string
  employee_id: string
  weekdays: number[]
  start_time: string
  end_time: string
  valid_from: string
  valid_until: string | null
  generated_through: string | null
}

export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface TimeOffRequest {
  id: string
  branch_id: string
  employee_id: string
  request_date: string
  reason: string
  status: RequestStatus
  decided_by: string | null
  decided_at: string | null
  note: string | null
}

export interface TemplateInput {
  weekdays: number[]
  start_time: string
  end_time: string
  valid_from: string
  valid_until?: string | null
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

// --- Employee self-service (authenticated-only, no staff.read/manage) -----------------------
export async function getMyEmployee(): Promise<Employee> {
  return (await http.get<Employee>('/staff/employees/me')).data
}

export async function listMyShifts(): Promise<PlannedShift[]> {
  return (await http.get<PlannedShift[]>('/staff/employees/me/shifts')).data
}

export async function createMyTimeOffRequest(input: {
  request_date: string
  reason: string
}): Promise<TimeOffRequest> {
  return (await http.post<TimeOffRequest>('/staff/employees/me/time-off-requests', input)).data
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

// --- Week-range read (the calendar query) --------------------------------------------------
export async function listShiftsRange(
  branchId: string,
  from: string,
  to: string,
): Promise<PlannedShift[]> {
  return (
    await http.get<PlannedShift[]>('/staff/shifts', {
      params: { branch_id: branchId, from, to },
    })
  ).data
}

export async function createManualShift(
  employeeId: string,
  input: ShiftInput & { note?: string | null },
): Promise<PlannedShift> {
  return (await http.post<PlannedShift>(`/staff/employees/${employeeId}/shifts`, input)).data
}

// --- Day off / coverage --------------------------------------------------------------------
export async function markDayOff(
  shiftId: string,
  reason: string,
  coverEmployeeId?: string | null,
): Promise<PlannedShift> {
  return (
    await http.post<PlannedShift>(`/staff/shifts/${shiftId}/day-off`, {
      reason,
      cover_employee_id: coverEmployeeId ?? null,
    })
  ).data
}

export async function assignCoverage(
  shiftId: string,
  coverEmployeeId: string,
): Promise<PlannedShift> {
  return (
    await http.post<PlannedShift>(`/staff/shifts/${shiftId}/coverage`, {
      cover_employee_id: coverEmployeeId,
    })
  ).data
}

export async function listAvailableCovers(
  branchId: string,
  date: string,
): Promise<Employee[]> {
  return (
    await http.get<Employee[]>('/staff/coverage', {
      params: { branch_id: branchId, date },
    })
  ).data
}

// --- Templates -----------------------------------------------------------------------------
export async function getTemplate(employeeId: string): Promise<ShiftTemplate | null> {
  return (await http.get<ShiftTemplate | null>(`/staff/employees/${employeeId}/template`)).data
}

export async function listTemplates(branchId?: string): Promise<ShiftTemplate[]> {
  const params: Record<string, string> = {}
  if (branchId) params.branch_id = branchId
  return (await http.get<ShiftTemplate[]>('/staff/templates', { params })).data
}

export async function upsertTemplate(
  employeeId: string,
  input: TemplateInput,
): Promise<ShiftTemplate> {
  return (await http.put<ShiftTemplate>(`/staff/employees/${employeeId}/template`, input)).data
}

export async function extendHorizon(employeeId: string): Promise<ShiftTemplate> {
  return (await http.post<ShiftTemplate>(`/staff/employees/${employeeId}/template/extend`)).data
}

// --- Time-off requests ---------------------------------------------------------------------
export async function listTimeOffRequests(params: {
  branchId?: string
  status?: RequestStatus
} = {}): Promise<TimeOffRequest[]> {
  const query: Record<string, string> = {}
  if (params.branchId) query.branch_id = params.branchId
  if (params.status) query.status = params.status
  return (await http.get<TimeOffRequest[]>('/staff/time-off-requests', { params: query })).data
}

export async function createTimeOffRequest(
  employeeId: string,
  input: { request_date: string; reason: string },
): Promise<TimeOffRequest> {
  return (
    await http.post<TimeOffRequest>(
      `/staff/employees/${employeeId}/time-off-requests`,
      input,
    )
  ).data
}

export async function approveTimeOffRequest(
  requestId: string,
  coverEmployeeId?: string | null,
): Promise<TimeOffRequest> {
  return (
    await http.post<TimeOffRequest>(`/staff/time-off-requests/${requestId}/approve`, {
      cover_employee_id: coverEmployeeId ?? null,
    })
  ).data
}

export async function rejectTimeOffRequest(
  requestId: string,
  reason: string,
): Promise<TimeOffRequest> {
  return (
    await http.post<TimeOffRequest>(`/staff/time-off-requests/${requestId}/reject`, {
      reason,
    })
  ).data
}
