import { describe, expect, it } from 'vitest'
import { openDeliveryPoints, ringRangeLabel, routeCode } from '../deliveryRoutes'

const delivery = (
  id: string,
  status: string,
  lat: string | null,
  lng: string | null,
  neighborhood: string | null = null,
) => ({
  id,
  delivery_status: status,
  address_text: `Calle ${id}`,
  neighborhood,
  latitude: lat,
  longitude: lng,
})

describe('openDeliveryPoints', () => {
  it('plots only open deliveries with parseable coordinates', () => {
    const { points, unlocated } = openDeliveryPoints([
      delivery('d1', 'pending', '11.5449000', '-72.9072000'),
      delivery('d2', 'in_transit', '11.5400000', '-72.9100000'),
      delivery('d3', 'delivered', '11.5000000', '-72.9000000'), // closed → out
      delivery('d4', 'assigned', null, null), // open but unlocated → counted
      delivery('d5', 'pending', 'garbage', '-72.9'), // unparseable → counted
    ])
    expect(points.map((p) => p.id)).toEqual(['d1', 'd2'])
    expect(points[0]?.coords).toEqual([11.5449, -72.9072])
    expect(points[1]?.status).toBe('in_transit')
    expect(unlocated).toBe(2)
  })

  it('labels with address and optional neighborhood', () => {
    const { points } = openDeliveryPoints([
      delivery('d1', 'pending', '11.54', '-72.90', 'Centro'),
      delivery('d2', 'pending', '11.55', '-72.91'),
    ])
    expect(points[0]?.label).toBe('Calle d1 · Centro')
    expect(points[1]?.label).toBe('Calle d2')
  })
})

describe('ring helpers (regression)', () => {
  it('bands read as hasta/range and codes come from the distinguishing word', () => {
    expect(ringRangeLabel(0, 0.5)).toBe('hasta 0.5 km')
    expect(ringRangeLabel(2, 0.5)).toBe('1 – 1.5 km')
    expect(routeCode('Ruta Oriente')).toBe('OR')
    expect(routeCode('Ruta Occidente')).toBe('OC')
  })
})
