import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn<(...a: unknown[]) => unknown>()
vi.mock('@/lib/http', () => ({ http: { get: (...a: unknown[]) => get(...a) } }))

import * as api from '../reports.api'

beforeEach(() => get.mockReset())

describe('reports api layer', () => {
  it('fetches a shift operational record by session id', async () => {
    get.mockResolvedValue({
      data: {
        orders: [{ id: 'o1', channel: 'delivery', status: 'closed', total: '12000', created_at: null }],
        deliveries: [
          { order_id: 'o1', delivery_status: 'delivered', address_text: 'Calle 1', neighborhood: null },
        ],
      },
    })
    const record = await api.getShiftRecord('s1')
    expect(get).toHaveBeenCalledWith('/reports/shift/s1')
    expect(record.orders).toHaveLength(1)
    expect(record.deliveries[0]?.order_id).toBe('o1')
  })
})
