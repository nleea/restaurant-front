import { describe, expect, it } from 'vitest'
import { parseSharedLocation, toCoordinateStrings } from '../geo'

describe('parseSharedLocation', () => {
  it('parses a plain decimal pair', () => {
    expect(parseSharedLocation('11.5442, -72.9075')).toEqual([11.5442, -72.9075])
    expect(parseSharedLocation('11.5442,-72.9075')).toEqual([11.5442, -72.9075])
    expect(parseSharedLocation('  -4.2 ; 120.5  ')).toEqual([-4.2, 120.5])
  })

  it('parses the @lat,lng viewport segment of a Maps URL', () => {
    expect(
      parseSharedLocation('https://www.google.com/maps/place/Riohacha/@11.5442,-72.9075,15z'),
    ).toEqual([11.5442, -72.9075])
  })

  it('parses ?q=lat,lng and ?q=loc:lat,lng shares', () => {
    expect(parseSharedLocation('https://maps.google.com/?q=11.5442,-72.9075')).toEqual([
      11.5442, -72.9075,
    ])
    expect(parseSharedLocation('https://maps.google.com/maps?q=loc:11.5442+-72.9075')).toEqual([
      11.5442, -72.9075,
    ])
    expect(parseSharedLocation('https://maps.google.com/maps?q=LOC:11.5,-72.9')).toEqual([
      11.5, -72.9,
    ])
  })

  it('parses !3d…!4d… data segments of long place URLs', () => {
    expect(
      parseSharedLocation(
        'https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d11.5442!4d-72.9075',
      ),
    ).toEqual([11.5442, -72.9075])
  })

  it('rejects out-of-range coordinates', () => {
    expect(parseSharedLocation('95.0, -72.9')).toBeNull()
    expect(parseSharedLocation('11.5, -195.0')).toBeNull()
    expect(parseSharedLocation('https://maps.google.com/?q=95.0,-72.9')).toBeNull()
  })

  it('returns null for short links and free text', () => {
    expect(parseSharedLocation('https://maps.app.goo.gl/AbCdEf123')).toBeNull()
    expect(parseSharedLocation('Cra 7 # 12-34, Centro')).toBeNull()
    expect(parseSharedLocation('')).toBeNull()
  })
})

describe('toCoordinateStrings', () => {
  it('formats with 7 decimals as the API stores them', () => {
    expect(toCoordinateStrings([11.5442, -72.9075])).toEqual({
      latitude: '11.5442000',
      longitude: '-72.9075000',
    })
  })
})
