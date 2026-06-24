import { defineStore } from 'pinia'
import * as api from '@/services/rbac.api'
import type { Permission, Role, UserAccess, UserSummary } from '@/services/rbac.api'

interface RbacState {
  permissions: Permission[]
  roles: Role[]
  users: UserSummary[]
}

export const useRbacStore = defineStore('rbac', {
  state: (): RbacState => ({
    permissions: [],
    roles: [],
    users: [],
  }),

  getters: {
    // Catalog grouped by module for the permission-set editor.
    permissionsByModule: (state): Record<string, Permission[]> => {
      const groups: Record<string, Permission[]> = {}
      for (const p of state.permissions) {
        ;(groups[p.module] ??= []).push(p)
      }
      return groups
    },
    // Overrides come back keyed by permission_id; map back to codes for display.
    codeForPermissionId: (state) => (id: string): string | undefined =>
      state.permissions.find((p) => p.id === id)?.code,
  },

  actions: {
    async fetchCatalog(): Promise<void> {
      this.permissions = await api.listPermissions()
    },
    async fetchRoles(): Promise<void> {
      this.roles = await api.listRoles()
    },
    async fetchUsers(): Promise<void> {
      this.users = await api.listUsers()
    },

    async createRole(name: string, description?: string | null): Promise<Role> {
      const role = await api.createRole(name, description)
      await this.fetchRoles()
      return role
    },

    // Role permissions: per-toggle writes, reconciled against the server.
    getRolePermissions(roleId: string): Promise<string[]> {
      return api.getRolePermissions(roleId)
    },
    async toggleRolePermission(roleId: string, code: string, enabled: boolean): Promise<void> {
      if (enabled) {
        await api.addRolePermission(roleId, code)
      } else {
        await api.removeRolePermission(roleId, code)
      }
    },

    // User access: roles + overrides, with the effective result.
    getUserAccess(userId: string): Promise<UserAccess> {
      return api.getUserAccess(userId)
    },
    assignRole(userId: string, roleId: string): Promise<void> {
      return api.assignRole(userId, roleId)
    },
    revokeRole(userId: string, roleId: string): Promise<void> {
      return api.revokeRole(userId, roleId)
    },
    setOverride(userId: string, code: string, effect: api.PermissionEffect): Promise<void> {
      return api.setOverride(userId, code, effect)
    },
    removeOverride(userId: string, code: string): Promise<void> {
      return api.removeOverride(userId, code)
    },
  },
})
