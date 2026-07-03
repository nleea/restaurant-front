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
