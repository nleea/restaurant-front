import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// vi.mock is hoisted above module init, so the mock object must be created via vi.hoisted.
const apiMock = vi.hoisted(() => ({
  listPermissions: vi.fn<(...a: unknown[]) => unknown>(),
  listRoles: vi.fn<(...a: unknown[]) => unknown>(),
  listUsers: vi.fn<(...a: unknown[]) => unknown>(),
  createRole: vi.fn<(...a: unknown[]) => unknown>(),
  addRolePermission: vi.fn<(...a: unknown[]) => unknown>(),
  removeRolePermission: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/rbac.api', () => apiMock)

import { useRbacStore } from '../rbac'

const PERMS = [
  { id: 'p1', code: 'menu.read', name: 'View menu', module: 'menu', description: null },
  { id: 'p2', code: 'menu.manage', name: 'Manage menu', module: 'menu', description: null },
  { id: 'p3', code: 'cash.read', name: 'View cash', module: 'cash', description: null },
]

beforeEach(() => {
  setActivePinia(createPinia())
  Object.values(apiMock).forEach((m) => m.mockReset())
})

describe('rbac store', () => {
  it('groups the permission catalog by module', async () => {
    apiMock.listPermissions.mockResolvedValue(PERMS)
    const rbac = useRbacStore()
    await rbac.fetchCatalog()
    expect(Object.keys(rbac.permissionsByModule)).toEqual(['menu', 'cash'])
    expect(rbac.permissionsByModule.menu).toHaveLength(2)
  })

  it('maps a permission id back to its code (for overrides)', async () => {
    apiMock.listPermissions.mockResolvedValue(PERMS)
    const rbac = useRbacStore()
    await rbac.fetchCatalog()
    expect(rbac.codeForPermissionId('p3')).toBe('cash.read')
    expect(rbac.codeForPermissionId('nope')).toBeUndefined()
  })

  it('creates a role and refetches the list', async () => {
    apiMock.createRole.mockResolvedValue({ id: 'r9', name: 'barista' })
    apiMock.listRoles.mockResolvedValue([{ id: 'r9', name: 'barista' }])
    const rbac = useRbacStore()
    await rbac.createRole('barista', 'Coffee')
    expect(apiMock.createRole).toHaveBeenCalledWith('barista', 'Coffee')
    expect(apiMock.listRoles).toHaveBeenCalled()
    expect(rbac.roles).toHaveLength(1)
  })

  it('toggles a role permission via add/remove', async () => {
    apiMock.addRolePermission.mockResolvedValue(undefined)
    apiMock.removeRolePermission.mockResolvedValue(undefined)
    const rbac = useRbacStore()
    await rbac.toggleRolePermission('r1', 'menu.read', true)
    await rbac.toggleRolePermission('r1', 'menu.read', false)
    expect(apiMock.addRolePermission).toHaveBeenCalledWith('r1', 'menu.read')
    expect(apiMock.removeRolePermission).toHaveBeenCalledWith('r1', 'menu.read')
  })
})
