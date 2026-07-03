// Leaflet wiring for the "Domicilios" coverage map. Leaflet ships via CDN (no npm dependency),
// so this module lazy-injects the CSS+JS once and types only the slice of the API it touches.
// Rings are one L.circle per route at the band's OUTER radius, added largest-first so inner
// fills stack on top. The ring center is the branch's business pin — until it exists (settings
// without coordinates), no rings are drawn and the map is in "place your pin" territory.

import {
  DELIVERY_POINT_META,
  ringRangeLabel,
  type DeliveryPoint,
  type DeliveryRoute,
} from '@/lib/deliveryRoutes'

const LEAFLET_VERSION = '1.9.4'
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`

/** Country-level view while a branch has no business pin yet. */
export const NO_PIN_VIEW: { center: [number, number]; zoom: number } = {
  center: [4.6, -74.1],
  zoom: 6,
}

// --- Minimal structural types for the Leaflet surface we use --------------------------------
interface LLayer {
  addTo(map: LMap): LLayer
  remove(): void
  on(event: string, handler: () => void): LLayer
  bindTooltip(content: string, options?: Record<string, unknown>): LLayer
  setTooltipContent(content: string): LLayer
}
export interface LCircle extends LLayer {
  setRadius(meters: number): LCircle
  setStyle(style: Record<string, unknown>): LCircle
  setLatLng(center: [number, number]): LCircle
  getBounds(): unknown
}
export interface LMap {
  setView(center: [number, number], zoom: number): LMap
  flyToBounds(bounds: unknown, options?: Record<string, unknown>): LMap
  fitBounds(bounds: unknown, options?: Record<string, unknown>): LMap
  flyTo(center: [number, number], zoom: number): LMap
  on(event: string, handler: (event: { latlng: { lat: number; lng: number } }) => void): LMap
  invalidateSize(): LMap
  remove(): void
}
export interface LeafletGlobal {
  map(el: HTMLElement, options?: Record<string, unknown>): LMap
  tileLayer(url: string, options?: Record<string, unknown>): LLayer
  circle(center: [number, number], options: Record<string, unknown>): LCircle
  circleMarker(center: [number, number], options: Record<string, unknown>): LCircle
}

let leafletPromise: Promise<LeafletGlobal> | null = null

export function ensureLeaflet(): Promise<LeafletGlobal> {
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = CSS_URL
      document.head.appendChild(link)
    }
    const existing = (window as unknown as { L?: LeafletGlobal }).L
    if (existing) return resolve(existing)
    const script = document.createElement('script')
    script.src = JS_URL
    script.onload = () => {
      const leaflet = (window as unknown as { L?: LeafletGlobal }).L
      if (leaflet) resolve(leaflet)
      else reject(new Error('Leaflet no cargó'))
    }
    script.onerror = () => reject(new Error('No se pudo cargar el mapa'))
    document.head.appendChild(script)
  })
  return leafletPromise
}

export interface RingsController {
  /** Move (or unset) the business pin the rings radiate from. */
  setCenter(center: [number, number] | null): void
  /** (Re)draw every ring from the current routes + step; no-op without a center. */
  sync(routes: DeliveryRoute[], stepKm: number, selectedId: string | null, onlyActive: boolean): void
  /** Instantly frame a ring (initial view: the outermost, so the whole board is in sight). */
  frameRing(routeId: string): void
  /** Smoothly frame the selected route's outer ring. */
  focusRing(routeId: string): void
  /** Fly to a point (e.g. the device-location suggestion during onboarding). */
  centerOn(center: [number, number], zoom?: number): void
  /** Live open-deliveries overlay: one status-colored dot per point (absolute coords). */
  setDeliveryPoints(points: DeliveryPoint[]): void
  /** Dashed preview ring at the next free band (new-route modal). */
  showPreview(color: string, index: number, stepKm: number): void
  hidePreview(): void
  /** Candidate business pin while picking a location on the map. */
  showPinPreview(center: [number, number]): void
  hidePinPreview(): void
  destroy(): void
}

export async function createRingsMap(
  el: HTMLElement,
  handlers: {
    onRingClick: (routeId: string) => void
    onMapClick: (center: [number, number]) => void
  },
): Promise<RingsController> {
  const leaflet = await ensureLeaflet()
  const map = leaflet.map(el, { zoomControl: true, attributionControl: true })
  map.setView(NO_PIN_VIEW.center, NO_PIN_VIEW.zoom)
  leaflet
    .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    })
    .addTo(map)
  map.on('click', (event) => handlers.onMapClick([event.latlng.lat, event.latlng.lng]))

  let center: [number, number] | null = null
  let businessMarker: LCircle | null = null
  const circles = new Map<string, LCircle>()
  const deliveryDots = new Map<string, LCircle>()
  let preview: LCircle | null = null
  let pinPreview: LCircle | null = null

  function styleFor(route: DeliveryRoute, selected: boolean, anySelected: boolean, hidden: boolean) {
    if (hidden) return { opacity: 0, fillOpacity: 0 }
    if (selected) return { color: route.color, weight: 3, opacity: 1, fillColor: route.color, fillOpacity: 0.18 }
    return {
      color: route.color,
      weight: 2,
      opacity: anySelected ? 0.4 : route.isActive ? 0.9 : 0.35,
      fillColor: route.color,
      fillOpacity: anySelected ? 0.04 : route.isActive ? 0.08 : 0.03,
    }
  }

  function clearRings() {
    for (const circle of circles.values()) circle.remove()
    circles.clear()
  }

  return {
    setCenter(next) {
      center = next
      if (!next) {
        businessMarker?.remove()
        businessMarker = null
        clearRings()
        return
      }
      if (!businessMarker) {
        businessMarker = leaflet.circleMarker(next, {
          radius: 8,
          color: '#d97a22', // ember-600
          weight: 3,
          fillColor: '#f2933b', // ember
          fillOpacity: 1,
        })
        businessMarker.addTo(map)
        businessMarker.bindTooltip('Tu negocio', { direction: 'top' })
      } else {
        businessMarker.setLatLng(next)
      }
      for (const circle of circles.values()) circle.setLatLng(next)
    },

    sync(routes, stepKm, selectedId, onlyActive) {
      if (!center) {
        clearRings()
        return
      }
      const at = center
      const seen = new Set<string>()
      // Largest band first so inner rings render on top of outer fills.
      const ordered = routes.map((r, i) => ({ route: r, index: i })).sort((a, b) => b.index - a.index)
      for (const { route, index } of ordered) {
        seen.add(route.id)
        const radiusM = (index + 1) * stepKm * 1000
        const hidden = onlyActive && !route.isActive
        const tooltip = `${route.name} — ${ringRangeLabel(index, stepKm)}`
        let circle = circles.get(route.id)
        if (!circle) {
          circle = leaflet.circle(at, { radius: radiusM })
          circle.addTo(map)
          circle.on('click', () => handlers.onRingClick(route.id))
          circle.bindTooltip(tooltip, { sticky: true })
          circles.set(route.id, circle)
        }
        circle.setLatLng(at)
        circle.setRadius(radiusM)
        circle.setTooltipContent(tooltip)
        circle.setStyle(styleFor(route, route.id === selectedId, selectedId !== null, hidden))
      }
      for (const [id, circle] of circles) {
        if (!seen.has(id)) {
          circle.remove()
          circles.delete(id)
        }
      }
    },

    frameRing(routeId) {
      const circle = circles.get(routeId)
      if (circle) {
        map.invalidateSize()
        map.fitBounds(circle.getBounds(), { padding: [48, 48] })
      }
    },

    focusRing(routeId) {
      const circle = circles.get(routeId)
      if (circle) map.flyToBounds(circle.getBounds(), { padding: [48, 48], duration: 0.6 })
    },

    centerOn(target, zoom = 14) {
      map.flyTo(target, zoom)
    },

    setDeliveryPoints(points) {
      const seen = new Set<string>()
      for (const point of points) {
        seen.add(point.id)
        const meta = DELIVERY_POINT_META[point.status]
        const tooltip = `${point.label} — ${meta.label}`
        let dot = deliveryDots.get(point.id)
        if (!dot) {
          // Small, white-stroked so it reads over any ring fill — demand layer, not coverage.
          dot = leaflet.circleMarker(point.coords, { radius: 5, weight: 2 })
          dot.addTo(map)
          dot.bindTooltip(tooltip, { direction: 'top' })
          deliveryDots.set(point.id, dot)
        }
        dot.setLatLng(point.coords)
        dot.setTooltipContent(tooltip)
        dot.setStyle({ color: '#ffffff', weight: 2, fillColor: meta.color, fillOpacity: 1 })
      }
      for (const [id, dot] of deliveryDots) {
        if (!seen.has(id)) {
          dot.remove()
          deliveryDots.delete(id)
        }
      }
    },

    showPreview(color, index, stepKm) {
      if (!center) return
      const radiusM = (index + 1) * stepKm * 1000
      if (!preview) {
        preview = leaflet.circle(center, { radius: radiusM })
        preview.addTo(map)
      }
      preview.setLatLng(center)
      preview.setRadius(radiusM)
      preview.setStyle({ color, weight: 2, dashArray: '6 6', opacity: 0.9, fillColor: color, fillOpacity: 0.06 })
    },

    hidePreview() {
      preview?.remove()
      preview = null
    },

    showPinPreview(at) {
      if (!pinPreview) {
        pinPreview = leaflet.circleMarker(at, {
          radius: 9,
          color: '#d97a22',
          weight: 3,
          dashArray: '3 3',
          fillColor: '#f2933b',
          fillOpacity: 0.5,
        })
        pinPreview.addTo(map)
        pinPreview.bindTooltip('Nueva ubicación', { direction: 'top' })
      } else {
        pinPreview.setLatLng(at)
      }
    },

    hidePinPreview() {
      pinPreview?.remove()
      pinPreview = null
    },

    destroy() {
      map.remove()
    },
  }
}
