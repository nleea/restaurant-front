import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
const post = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({
  http: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
  },
}))

import * as api from '../storefront.api'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('storefront api layer', () => {
  it('fetches public opening hours (open-now + next opening)', async () => {
    get.mockResolvedValue({
      data: {
        isOpenNow: false,
        nextOpening: { weekday: 0, minute: 480 },
        windows: [{ weekday: 0, openMinute: 480, closeMinute: 1020 }],
      },
    })
    const hours = await api.getStorefrontHours()
    expect(get).toHaveBeenCalledWith('/storefront/hours')
    expect(hours.isOpenNow).toBe(false)
    expect(hours.nextOpening?.minute).toBe(480)
  })
})

describe('branch addressing', () => {
  it('omits the branch segment when no code is given (short link stays)', async () => {
    get.mockResolvedValue({ data: { categories: [], products: [] } })
    await api.getMenu()
    expect(get).toHaveBeenCalledWith('/storefront/menu')
  })

  it('addresses the branch as a path segment on menu and hours', async () => {
    get.mockResolvedValue({ data: { categories: [], products: [] } })
    await api.getMenu('centro')
    expect(get).toHaveBeenCalledWith('/storefront/centro/menu')

    get.mockResolvedValue({ data: { isOpenNow: true, nextOpening: null, windows: [] } })
    await api.getStorefrontHours('centro')
    expect(get).toHaveBeenCalledWith('/storefront/centro/hours')
  })

  it('posts the order to the addressed branch, keeping the branch out of the body', async () => {
    post.mockResolvedValue({ data: { orderId: 'o1', orderNumber: 'o1', status: 'open' } })
    const payload = {
      customer: { name: 'Ana', phone: '300' },
      fulfillment: { type: 'pickup' as const },
      paymentMethod: 'efectivo',
      lines: [],
    }
    await api.createOrder(payload, 'norte')
    expect(post).toHaveBeenCalledWith('/storefront/norte/orders', payload)
    expect(JSON.stringify(payload)).not.toContain('norte')
  })

  it('encodes the code so it cannot break out of the path segment', async () => {
    get.mockResolvedValue({ data: { categories: [], products: [] } })
    await api.getMenu('a/b')
    expect(get).toHaveBeenCalledWith('/storefront/a%2Fb/menu')
  })

  it('lists branches for the picker', async () => {
    get.mockResolvedValue({
      data: [{ id: '1', code: 'centro', name: 'Centro', address: 'Cra 1' }],
    })
    const branches = await api.getBranches()
    expect(get).toHaveBeenCalledWith('/storefront/branches')
    expect(branches[0]?.code).toBe('centro')
  })
})
