import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const put = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
  },
}))

import * as api from '../business.api'

beforeEach(() => {
  get.mockReset()
  put.mockReset()
})

describe('business profile api layer', () => {
  it('fetches the business profile', async () => {
    get.mockResolvedValue({ data: { tenantId: 't1', name: 'La Cevichería', staffCount: 7 } })
    const profile = await api.getBusinessProfile()
    expect(get).toHaveBeenCalledWith('/business/profile')
    expect(profile.staffCount).toBe(7)
  })

  it('updates the business profile with identity + branch details', async () => {
    put.mockResolvedValue({ data: { tenantId: 't1', name: 'Nuevo', branches: [] } })
    const payload = {
      name: 'Nuevo',
      taxId: '900123456-7',
      email: 'hola@demo.com',
      phone: '3001234567',
      branches: [{ id: 'b1', address: 'Calle 1', phone: '3009999999' }],
    }
    const updated = await api.updateBusinessProfile(payload)
    expect(put).toHaveBeenCalledWith('/business/profile', payload)
    expect(updated.name).toBe('Nuevo')
  })

  it('fetches a branch operating hours', async () => {
    get.mockResolvedValue({
      data: [{ id: 'h1', weekday: 0, openMinute: 480, closeMinute: 1080 }],
    })
    const hours = await api.getBranchHours('b1')
    expect(get).toHaveBeenCalledWith('/business/branches/b1/hours')
    expect(hours).toHaveLength(1)
  })

  it('saves a branch operating hours wrapping windows in a { windows } body', async () => {
    put.mockResolvedValue({ data: [{ id: 'h1', weekday: 0, openMinute: 480, closeMinute: 1080 }] })
    const windows = [{ weekday: 0, openMinute: 480, closeMinute: 1080 }]
    const saved = await api.setBranchHours('b1', windows)
    expect(put).toHaveBeenCalledWith('/business/branches/b1/hours', { windows })
    expect(saved[0]?.openMinute).toBe(480)
  })
})
