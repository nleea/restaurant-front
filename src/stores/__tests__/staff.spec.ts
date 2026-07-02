import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const staffApi = vi.hoisted(() => ({
  listEmployees: vi.fn<(...a: unknown[]) => unknown>(),
  getEmployee: vi.fn<(...a: unknown[]) => unknown>(),
  createEmployee: vi.fn<(...a: unknown[]) => unknown>(),
  updateEmployeeRole: vi.fn<(...a: unknown[]) => unknown>(),
  deactivateEmployee: vi.fn<(...a: unknown[]) => unknown>(),
  provisionUser: vi.fn<(...a: unknown[]) => unknown>(),
  listShifts: vi.fn<(...a: unknown[]) => unknown>(),
  createShift: vi.fn<(...a: unknown[]) => unknown>(),
  updateShift: vi.fn<(...a: unknown[]) => unknown>(),
  deleteShift: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/staff.api', () => staffApi)

const rbacApi = vi.hoisted(() => ({
  listUsers: vi.fn<(...a: unknown[]) => unknown>(),
  listRoles: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/rbac.api', () => rbacApi)

import { useStaffStore, isValidShiftRange } from '../staff'
import { useBranchStore } from '../branch'

const EMP = {
  id: 'e1',
  branch_id: 'b1',
  person_id: 'p1',
  user_id: 'u1',
  role_id: 'r1',
  hired_at: null,
  is_active: true,
}
const USERS = [{ id: 'u1', email: 'jane@demo.com', name: 'Jane Doe', username: null, is_active: true, last_login_at: null }]
const ROLES = [{ id: 'r1', name: 'Cajero', description: null, is_global: true, is_active: true, tenant_id: null }]

beforeEach(() => {
  setActivePinia(createPinia())
  Object.values(staffApi).forEach((m) => m.mockReset())
  Object.values(rbacApi).forEach((m) => m.mockReset())
})

describe('staff store', () => {
  it('resolves employee/role/branch labels with no raw UUIDs', async () => {
    rbacApi.listUsers.mockResolvedValue(USERS)
    rbacApi.listRoles.mockResolvedValue(ROLES)
    staffApi.listEmployees.mockResolvedValue([EMP])
    // Seed the branch directory so branchName resolves.
    const branch = useBranchStore()
    branch.branches = [{ id: 'b1', code: 'C-01', name: 'Principal', is_primary: true }]

    const staff = useStaffStore()
    await staff.ensureLoaded()

    expect(staff.employeeName(EMP)).toBe('Jane Doe')
    expect(staff.employeeEmail(EMP)).toBe('jane@demo.com')
    expect(staff.roleName('r1')).toBe('Cajero')
    expect(staff.branchName('b1')).toBe('Principal')
  })

  it('addEmployee provisions the user then creates the employee (two calls)', async () => {
    rbacApi.listUsers.mockResolvedValue(USERS)
    rbacApi.listRoles.mockResolvedValue(ROLES)
    staffApi.listEmployees.mockResolvedValue([EMP])
    staffApi.provisionUser.mockResolvedValue({
      id: 'u9',
      email: 'new@demo.com',
      name: 'New Hire',
      is_active: true,
      person_id: 'p9',
    })
    staffApi.createEmployee.mockResolvedValue({ ...EMP, id: 'e9', user_id: 'u9', person_id: 'p9' })

    const staff = useStaffStore()
    await staff.addEmployee({
      first_name: 'New',
      last_name: 'Hire',
      email: 'new@demo.com',
      password: 'secret-pass-123',
      role_id: 'r1',
      branch_id: 'b1',
    })

    expect(staffApi.provisionUser).toHaveBeenCalledTimes(1)
    expect(staffApi.createEmployee).toHaveBeenCalledWith({
      branch_id: 'b1',
      person_id: 'p9',
      user_id: 'u9',
      role_id: 'r1',
    })
  })

  it('addEmployee surfaces a conflict and does not create the employee', async () => {
    staffApi.provisionUser.mockRejectedValue({ response: { status: 409 } })

    const staff = useStaffStore()
    await expect(
      staff.addEmployee({
        first_name: 'Dup',
        last_name: 'Email',
        email: 'jane@demo.com',
        password: 'secret-pass-123',
        role_id: 'r1',
        branch_id: 'b1',
      }),
    ).rejects.toMatchObject({ response: { status: 409 } })
    expect(staffApi.createEmployee).not.toHaveBeenCalled()
  })

  it('changeRole writes through then refetches', async () => {
    staffApi.updateEmployeeRole.mockResolvedValue({ ...EMP, role_id: 'r2' })
    staffApi.listEmployees.mockResolvedValue([{ ...EMP, role_id: 'r2' }])

    const staff = useStaffStore()
    await staff.changeRole('e1', 'r2')

    expect(staffApi.updateEmployeeRole).toHaveBeenCalledWith('e1', 'r2')
    expect(staffApi.listEmployees).toHaveBeenCalledTimes(1)
  })

  it('addShift rejects an end-before-start range without calling the API', async () => {
    const staff = useStaffStore()
    await expect(
      staff.addShift('e1', { shift_date: '2026-07-01', start_time: '18:00', end_time: '09:00' }),
    ).rejects.toThrow(/posterior/)
    expect(staffApi.createShift).not.toHaveBeenCalled()
  })

  it('addShift creates a valid shift then refetches', async () => {
    staffApi.createShift.mockResolvedValue({})
    staffApi.listShifts.mockResolvedValue([])
    const staff = useStaffStore()
    await staff.addShift('e1', { shift_date: '2026-07-01', start_time: '09:00', end_time: '17:00' })
    expect(staffApi.createShift).toHaveBeenCalledTimes(1)
    expect(staffApi.listShifts).toHaveBeenCalledWith('e1')
  })

  it('isValidShiftRange compares times correctly', () => {
    expect(isValidShiftRange('09:00', '17:00')).toBe(true)
    expect(isValidShiftRange('17:00', '09:00')).toBe(false)
    expect(isValidShiftRange('09:00', '09:00')).toBe(false)
  })
})
