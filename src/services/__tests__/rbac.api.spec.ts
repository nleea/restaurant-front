import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
const put = vi.fn<(...a: unknown[]) => unknown>()
const del = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    put: (...a: unknown[]) => put(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}))

import * as api from '../rbac.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()
})

describe('rbac api layer', () => {
  it('lists users from GET /rbac/users', async () => {
    get.mockResolvedValue({ data: [{ id: '1', email: 'a@b.c' }] })
    const users = await api.listUsers()
    expect(get).toHaveBeenCalledWith('/rbac/users')
    expect(users).toHaveLength(1)
  })

  it('unwraps role permissions from the envelope', async () => {
    get.mockResolvedValue({ data: { role_id: 'r1', permissions: ['menu.read'] } })
    const codes = await api.getRolePermissions('r1')
    expect(get).toHaveBeenCalledWith('/rbac/roles/r1/permissions')
    expect(codes).toEqual(['menu.read'])
  })

  it('creates a role with a null description by default', async () => {
    post.mockResolvedValue({ data: { id: 'r2', name: 'barista' } })
    await api.createRole('barista')
    expect(post).toHaveBeenCalledWith('/rbac/roles', { name: 'barista', description: null })
  })

  it('sets an override via PUT with the effect body', async () => {
    put.mockResolvedValue({ data: undefined })
    await api.setOverride('u1', 'rbac.manage', 'deny')
    expect(put).toHaveBeenCalledWith('/rbac/users/u1/permissions/rbac.manage', { effect: 'deny' })
  })

  it('toggles a role permission with POST/DELETE on the code', async () => {
    post.mockResolvedValue({ data: undefined })
    del.mockResolvedValue({ data: undefined })
    await api.addRolePermission('r1', 'orders.read')
    await api.removeRolePermission('r1', 'orders.read')
    expect(post).toHaveBeenCalledWith('/rbac/roles/r1/permissions/orders.read')
    expect(del).toHaveBeenCalledWith('/rbac/roles/r1/permissions/orders.read')
  })
})
