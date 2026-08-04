// Pure geo helpers for the delivery location picker.
// `parseSharedLocation` understands what an operator actually pastes from a customer's
// WhatsApp share: a raw "lat, lng" pair or a Google Maps URL. Short links
// (maps.app.goo.gl) can't be resolved client-side — they return null and the UI copy
// tells the operator to open the link and copy the coordinates or the long URL.

const NUM = String.raw`(-?\d+(?:\.\d+)?)`

const URL_PATTERNS: RegExp[] = [
  // .../maps/place/.../@11.5442,-72.9075,15z — the "@lat,lng" viewport segment.
  new RegExp(String.raw`@${NUM},${NUM}`),
  // ...?q=loc:11.5442,-72.9075 (WhatsApp's classic share shape).
  new RegExp(String.raw`[?&]q=loc:${NUM}[,+]${NUM}`, 'i'),
  // ...?q=11.5442,-72.9075
  new RegExp(String.raw`[?&]q=${NUM}[,+]${NUM}`),
  // ...!3d11.5442!4d-72.9075 — data segments of long place URLs.
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
]

const PLAIN_PAIR = new RegExp(String.raw`^${NUM}\s*[,;]\s*${NUM}$`)

function validate(lat: number, lng: number): [number, number] | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

/**
 * Extract `[lat, lng]` from a pasted shared location, or `null` when the text
 * doesn't carry parseable coordinates (including Google Maps short links).
 */
export function parseSharedLocation(text: string): [number, number] | null {
  const input = text.trim()
  if (!input) return null

  const pair = PLAIN_PAIR.exec(input)
  if (pair) return validate(Number(pair[1]), Number(pair[2]))

  // Only URLs beyond this point — anything else is free text, not a location.
  if (!/^https?:\/\//i.test(input)) return null

  for (const pattern of URL_PATTERNS) {
    const match = pattern.exec(input)
    if (match) {
      const point = validate(Number(match[1]), Number(match[2]))
      if (point) return point
    }
  }
  return null
}

/** Format a picked point the way the API stores coordinates (Numeric(10,7) strings). */
export function toCoordinateStrings(point: [number, number]): {
  latitude: string
  longitude: string
} {
  return { latitude: point[0].toFixed(7), longitude: point[1].toFixed(7) }
}

/**
 * Great-circle distance in metres between two `[lat, lng]` points. Used to throttle GPS
 * samples by distance (only send a fix once the driver has actually moved).
 */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000 // Earth radius, metres
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Perpendicular distance from `p` to the segment `a→b`, in the (lat, lng) plane. Good enough
// for rendering simplification over a city-sized area.
function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
  const cx = a[0] + t * dx
  const cy = a[1] + t * dy
  return Math.hypot(p[0] - cx, p[1] - cy)
}

/**
 * Douglas–Peucker line simplification on `[lat, lng]` points — drops points that lie within
 * `tolerance` degrees (~5 m at the default) of the retained polyline. Keeps a long trail cheap
 * to draw without visibly changing its shape. Iterative so a huge path can't overflow the stack.
 */
export function simplifyPath(
  points: [number, number][],
  tolerance = 0.00005,
): [number, number][] {
  if (points.length <= 2) return points.slice()
  const keep = Array.from({ length: points.length }, () => false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const segment = stack.pop()
    if (!segment) continue
    const [first, last] = segment
    const a = points[first]
    const b = points[last]
    if (!a || !b) continue
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const point = points[i]
      if (!point) continue
      const dist = perpendicularDistance(point, a, b)
      if (dist > maxDist) {
        maxDist = dist
        index = i
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = true
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}
