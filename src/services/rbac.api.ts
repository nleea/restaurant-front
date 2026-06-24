// Typed RBAC API layer over the foundation's Axios instance. All endpoints are gated by
// `rbac.manage` on the backend; the tenant rides on the Host subdomain.
import { http } from '@/lib/http'

export type PermissionEffect = 'allow' | 'deny'

export interface Permission {
  id: string
  code: string
  name: string
  module: string
  description: string | null
}

export interface Role {
  id: string
  name: string
  description: string | null
  is_global: boolean
  is_active: boolean
  tenant_id: string | null
}

export interface RolePermissions {
  role_id: string
  permissions: string[]
}

export interface UserSummary {
  id: string
  email: string
  name: string
  username: string | null
  is_active: boolean
  last_login_at: string | null
}

export interface Override {
  permission_id: string
  effect: PermissionEffect
}

export interface UserAccess {
  user_id: string
  roles: Role[]
  effective_permissions: string[]
  overrides: Override[]
}

// --- Catalog / roles -----------------------------------------------------------------------
export async function listPermissions(): Promise<Permission[]> {
  return (await http.get<Permission[]>('/rbac/permissions')).data
}

export async function listRoles(): Promise<Role[]> {
  return (await http.get<Role[]>('/rbac/roles')).data
}

export async function createRole(name: string, description?: string | null): Promise<Role> {
  return (await http.post<Role>('/rbac/roles', { name, description: description ?? null })).data
}

export async function getRolePermissions(roleId: string): Promise<string[]> {
  return (await http.get<RolePermissions>(`/rbac/roles/${roleId}/permissions`)).data.permissions
}

export async function setRolePermissions(roleId: string, codes: string[]): Promise<string[]> {
  return (
    await http.put<RolePermissions>(`/rbac/roles/${roleId}/permissions`, { permissions: codes })
  ).data.permissions
}

export async function addRolePermission(roleId: string, code: string): Promise<void> {
  await http.post(`/rbac/roles/${roleId}/permissions/${code}`)
}

export async function removeRolePermission(roleId: string, code: string): Promise<void> {
  await http.delete(`/rbac/roles/${roleId}/permissions/${code}`)
}

// --- Users ---------------------------------------------------------------------------------
export async function listUsers(): Promise<UserSummary[]> {
  return (await http.get<UserSummary[]>('/rbac/users')).data
}

export async function getUserAccess(userId: string): Promise<UserAccess> {
  return (await http.get<UserAccess>(`/rbac/users/${userId}/access`)).data
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  await http.post(`/rbac/users/${userId}/roles/${roleId}`)
}

export async function revokeRole(userId: string, roleId: string): Promise<void> {
  await http.delete(`/rbac/users/${userId}/roles/${roleId}`)
}

export async function setOverride(
  userId: string,
  code: string,
  effect: PermissionEffect,
): Promise<void> {
  await http.put(`/rbac/users/${userId}/permissions/${code}`, { effect })
}

export async function removeOverride(userId: string, code: string): Promise<void> {
  await http.delete(`/rbac/users/${userId}/permissions/${code}`)
}
