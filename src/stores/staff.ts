import { defineStore } from 'pinia'
import * as api from '@/services/staff.api'
import type { Employee, PlannedShift, ShiftInput } from '@/services/staff.api'
import * as rbacApi from '@/services/rbac.api'
import type { Role, UserSummary } from '@/services/rbac.api'
import { useBranchStore } from '@/stores/branch'

// True when `end` is strictly after `start` for two same-format time strings ("HH:MM" or
// "HH:MM:SS"). Zero-padded 24h times compare correctly as plain strings.
export function isValidShiftRange(start: string, end: string): boolean {
  return end > start
}

export interface AddEmployeeInput {
  first_name: string
  last_name: string
  email: string
  password: string
  role_id: string
  branch_id: string
  document_number?: string | null
  phone?: string | null
}

interface StaffState {
  employees: Employee[]
  shiftsByEmployee: Record<string, PlannedShift[]>
  // Directories used to resolve the employees' raw UUIDs into human labels.
  usersById: Record<string, UserSummary>
  roles: Role[]
  directoriesLoaded: boolean
}

// Mirrors the menu/RBAC store discipline: each mutation writes through the API then refetches
// the affected list — no hand-maintained cache. Employee responses are UUID-only, so the store
// holds users/roles directories (and reads the branch store) to render names instead of ids.
export const useStaffStore = defineStore('staff', {
  state: (): StaffState => ({
    employees: [],
    shiftsByEmployee: {},
    usersById: {},
    roles: [],
    directoriesLoaded: false,
  }),

  getters: {
    employeeName:
      (state) =>
      (employee: Employee): string => {
        const user = state.usersById[employee.user_id]
        return user?.name || user?.email || '—'
      },
    employeeEmail:
      (state) =>
      (employee: Employee): string =>
        state.usersById[employee.user_id]?.email ?? '—',
    roleName:
      (state) =>
      (roleId: string): string =>
        state.roles.find((r) => r.id === roleId)?.name ?? '—',
    branchName:
      () =>
      (branchId: string): string =>
        useBranchStore().branches.find((b) => b.id === branchId)?.name ?? '—',
    shiftsOf:
      (state) =>
      (employeeId: string): PlannedShift[] =>
        state.shiftsByEmployee[employeeId] ?? [],
  },

  actions: {
    // Load the users/roles directories once (refresh with force after provisioning a user).
    async loadDirectories(force = false): Promise<void> {
      if (this.directoriesLoaded && !force) return
      const [users, roles] = await Promise.all([
        rbacApi.listUsers(),
        rbacApi.listRoles(),
      ])
      this.usersById = Object.fromEntries(users.map((u) => [u.id, u]))
      this.roles = roles
      this.directoriesLoaded = true
    },

    async fetchEmployees(params: { branchId?: string; active?: boolean } = {}): Promise<void> {
      this.employees = await api.listEmployees(params)
    },

    async ensureLoaded(params: { branchId?: string; active?: boolean } = {}): Promise<void> {
      await Promise.all([this.loadDirectories(), this.fetchEmployees(params)])
    },

    // Add an employee in two steps: provision the user+person, then link the employee for the
    // active branch and chosen role. A conflict (e.g. duplicate email) propagates to the caller.
    async addEmployee(input: AddEmployeeInput): Promise<Employee> {
      const user = await api.provisionUser({
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        password: input.password,
        document_number: input.document_number ?? null,
        phone: input.phone ?? null,
        role_id: input.role_id,
      })
      const employee = await api.createEmployee({
        branch_id: input.branch_id,
        person_id: user.person_id,
        user_id: user.id,
        role_id: input.role_id,
      })
      // The new user must appear in the directory so its label resolves.
      await Promise.all([this.loadDirectories(true), this.fetchEmployees()])
      return employee
    },

    async changeRole(employeeId: string, roleId: string): Promise<void> {
      await api.updateEmployeeRole(employeeId, roleId)
      await this.fetchEmployees()
    },

    async deactivate(employeeId: string): Promise<void> {
      await api.deactivateEmployee(employeeId)
      await this.fetchEmployees()
    },

    async fetchShifts(employeeId: string): Promise<void> {
      this.shiftsByEmployee[employeeId] = await api.listShifts(employeeId)
    },

    async addShift(employeeId: string, input: ShiftInput): Promise<void> {
      if (!isValidShiftRange(input.start_time, input.end_time)) {
        throw new Error('La hora de fin debe ser posterior a la de inicio.')
      }
      await api.createShift(employeeId, input)
      await this.fetchShifts(employeeId)
    },

    async editShift(
      employeeId: string,
      shiftId: string,
      patch: Partial<ShiftInput>,
    ): Promise<void> {
      if (
        patch.start_time !== undefined &&
        patch.end_time !== undefined &&
        !isValidShiftRange(patch.start_time, patch.end_time)
      ) {
        throw new Error('La hora de fin debe ser posterior a la de inicio.')
      }
      await api.updateShift(shiftId, patch)
      await this.fetchShifts(employeeId)
    },

    async removeShift(employeeId: string, shiftId: string): Promise<void> {
      await api.deleteShift(shiftId)
      await this.fetchShifts(employeeId)
    },
  },
})
