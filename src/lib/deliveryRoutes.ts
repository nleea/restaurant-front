// "Domicilios" design prototype — domain model, seed and ring math. Identifiers in English
// (project convention); Spanish lives in UI copy only. Mock only: all state in memory, no
// backend — routes are concentric delivery rings around the business, drivers are a shared
// pool assigned per route. Wiring to the real /delivery module is a separate change.

export type DriverStatus = 'on_route' | 'available' | 'inactive'

export interface Driver {
  id: string
  name: string
  status: DriverStatus
}

export interface DeliveryRoute {
  id: string
  name: string
  zones: string[]
  /** Ring stroke/fill color on the map — data color, ties the list to its ring. */
  color: string
  isActive: boolean
  driverIds: string[]
}

/** Business location the rings radiate from (Medellín; configurable when wired). */
export const BUSINESS_COORDS: [number, number] = [6.2442, -75.5812]

/** Ring width per route in km: slider range and default. */
export const RING_STEP_MIN_KM = 0.5
export const RING_STEP_MAX_KM = 5
export const RING_STEP_DEFAULT_KM = 1

// Data palette for rings — distinct from each other and from the ember UI accent (the brief's
// amber ring would read as "selected", so it became cyan). Also the presets for new routes.
export const RING_COLORS = [
  '#2563EB', // blue
  '#059669', // green
  '#0891B2', // cyan
  '#7C3AED', // violet
  '#DC2626', // red
  '#DB2777', // pink
] as const

export const DRIVER_STATUS_META: Record<DriverStatus, { label: string; pill: string }> = {
  on_route: { label: 'En ruta', pill: 'pill-info' },
  available: { label: 'Disponible', pill: 'pill-success' },
  inactive: { label: 'Inactivo', pill: 'pill-neutral' },
}

/**
 * Mono two-letter route code — the dispatcher's shorthand. Taken from the route's
 * distinguishing word, not its initials ("Ruta Oriente" → OR, "Ruta Occidente" → OC),
 * so sibling routes don't collide the way initials do.
 */
export function routeCode(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter((w) => w !== '' && !/^ruta$/i.test(w))
  const base = words[0] ?? (name.trim() || 'R?')
  return base.slice(0, 2).toUpperCase()
}

/** A route's ring band, by its position on the board: [i·step, (i+1)·step] km. */
export function ringBandKm(index: number, stepKm: number): { from: number; to: number } {
  return { from: index * stepKm, to: (index + 1) * stepKm }
}

const fmtKm = (km: number): string => (Number.isInteger(km) ? String(km) : km.toFixed(1))

/** "hasta 1 km" for the innermost ring, "1 – 2 km" beyond. */
export function ringRangeLabel(index: number, stepKm: number): string {
  const { from, to } = ringBandKm(index, stepKm)
  return index === 0 ? `hasta ${fmtKm(to)} km` : `${fmtKm(from)} – ${fmtKm(to)} km`
}

// --- Live deliveries overlay -------------------------------------------------
// An open per-order delivery plotted on the coverage map. Status colors are a separate layer
// from route colors: dots read as demand, rings as coverage.

export type OpenDeliveryStatus = 'pending' | 'assigned' | 'in_transit'

export interface DeliveryPoint {
  id: string
  coords: [number, number]
  status: OpenDeliveryStatus
  label: string
}

const OPEN_DELIVERY_STATUSES: readonly string[] = ['pending', 'assigned', 'in_transit']

export const DELIVERY_POINT_META: Record<OpenDeliveryStatus, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: '#6b7682' }, // steel-500
  assigned: { label: 'Asignado', color: '#3b7fd9' }, // info
  in_transit: { label: 'En camino', color: '#f2933b' }, // ember
}

interface PlottableDelivery {
  id: string
  delivery_status: string
  address_text: string
  neighborhood: string | null
  latitude: string | null
  longitude: string | null
}

/**
 * Open deliveries → plottable points + how many open ones carry no coordinates (surfaced as a
 * count so they're never silently missing from the map).
 */
export function openDeliveryPoints(deliveries: PlottableDelivery[]): {
  points: DeliveryPoint[]
  unlocated: number
} {
  const points: DeliveryPoint[] = []
  let unlocated = 0
  for (const delivery of deliveries) {
    if (!OPEN_DELIVERY_STATUSES.includes(delivery.delivery_status)) continue
    const lat = Number(delivery.latitude)
    const lng = Number(delivery.longitude)
    if (
      delivery.latitude == null ||
      delivery.longitude == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      unlocated++
      continue
    }
    points.push({
      id: delivery.id,
      coords: [lat, lng],
      status: delivery.delivery_status as OpenDeliveryStatus,
      label: delivery.neighborhood
        ? `${delivery.address_text} · ${delivery.neighborhood}`
        : delivery.address_text,
    })
  }
  return { points, unlocated }
}

// --- Live driver layer -------------------------------------------------------
// Active drivers on the coverage map: a distinct current marker (labeled with the driver's name
// + how fresh the fix is) and their trail as a polyline. A separate layer from delivery drops
// (demand) and rings (coverage): the marker is an actor, not a drop.

/** Older than this, a driver's position is de-emphasized rather than shown as if live. */
export const DRIVER_STALE_MS = 2 * 60_000

export interface DriverMarkerInput {
  /** The active run this marker belongs to (its identity on the map). */
  runId: string
  /** The driver's name (resolved by the caller), shown on the marker. */
  label: string
  /** Current position. */
  coords: [number, number]
  /** Ordered trail points (current point last); a polyline is drawn when ≥ 2. */
  trail: [number, number][]
  /** Human freshness, e.g. "hace 3 min". */
  ageLabel: string
  /** Whether the position is stale (past the threshold) → de-emphasized styling. */
  stale: boolean
}

/** "ahora" / "hace 3 min" / "hace 1 h" from an ISO timestamp — never implies more freshness. */
export function driverAgeLabel(recordedAtIso: string, now: number = Date.now()): string {
  const t = Date.parse(recordedAtIso)
  if (Number.isNaN(t)) return 'sin hora'
  const min = Math.floor(Math.max(0, now - t) / 60_000)
  if (min < 1) return 'ahora'
  if (min === 1) return 'hace 1 min'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return h === 1 ? 'hace 1 h' : `hace ${h} h`
}

/** Is a fix older than the staleness threshold (or untimestamped)? */
export function isPositionStale(
  recordedAtIso: string,
  now: number = Date.now(),
  thresholdMs: number = DRIVER_STALE_MS,
): boolean {
  const t = Date.parse(recordedAtIso)
  if (Number.isNaN(t)) return true
  return now - t > thresholdMs
}

export function seedDrivers(): Driver[] {
  return [
    { id: 'd1', name: 'Diego Repartidor', status: 'on_route' },
    { id: 'd2', name: 'Daniela Moto', status: 'available' },
    { id: 'd3', name: 'Carlos Veloz', status: 'inactive' },
    { id: 'd4', name: 'Sofía Domicilios', status: 'available' },
    { id: 'd5', name: 'Andrés Express', status: 'on_route' },
    { id: 'd6', name: 'test test', status: 'inactive' },
  ]
}

export function seedRoutes(): DeliveryRoute[] {
  return [
    {
      id: 'r1',
      name: 'Ruta Centro',
      zones: ['Centro', 'La Candelaria'],
      color: RING_COLORS[0],
      isActive: true,
      driverIds: ['d1', 'd2'],
    },
    {
      id: 'r2',
      name: 'Ruta Norte',
      zones: ['Chapinero', 'Usaquén', 'Cedritos'],
      color: RING_COLORS[1],
      isActive: true,
      driverIds: ['d4'],
    },
    {
      id: 'r3',
      name: 'Ruta Sur',
      zones: ['Kennedy', 'Bosa', 'Tunjuelito'],
      color: RING_COLORS[2],
      isActive: true,
      driverIds: ['d5'],
    },
    {
      id: 'r4',
      name: 'Ruta Oriente',
      zones: ['San Cristóbal', 'Usme'],
      color: RING_COLORS[3],
      isActive: true,
      driverIds: [],
    },
    {
      id: 'r5',
      name: 'Ruta Occidente',
      zones: ['Fontibón', 'Engativá'],
      color: RING_COLORS[4],
      isActive: false,
      driverIds: ['d3'],
    },
  ]
}
