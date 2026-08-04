<script setup lang="ts">
// Approximate reference map. It answers one question: roughly where are my drops relative to me.
// Leaflet is lazy-loaded from CDN the same way the coverage map does it (no npm dep); pins are
// circleMarkers coloured by delivery_status, the next stop enlarged with a white ring. The "Tú"
// dot is the driver's REAL live position (`myPosition`, from browser geolocation) with an ember
// ring to read as live, and their own accumulated `myTrail` is drawn as a graphite polyline —
// with no fix yet, no misleading own-position marker is shown. Stops with no coordinates are
// surfaced as a "sin ubicación" count rather than silently dropped.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DriverStop } from '@/services/delivery.api'
import { simplifyPath } from '@/lib/geo'

const props = defineProps<{
  stops: DriverStop[]
  nextStopId: string | null
  myPosition: { lat: number; lng: number } | null
  myTrail: { lat: number; lng: number }[]
}>()
const emit = defineEmits<{ open: [id: string] }>()

// Fallback centre (Riohacha) for the INITIAL map view only — never drawn as a marker, so it can't
// be mistaken for the driver's position when there's no fix.
const FALLBACK_VIEW = { lat: 11.5385, lng: -72.9128 }
// Above this many trail points, simplify (Douglas–Peucker) before drawing to keep the line cheap.
const TRAIL_SIMPLIFY_ABOVE = 50

const POINT_COLOR: Record<DriverStop['delivery_status'], string> = {
  pending: '#d98a15', // warn
  assigned: '#97a0aa', // steel (pulled, pre-depart)
  in_transit: '#f2933b', // ember (out for delivery)
  delivered: '#2f9e5b', // success
  not_delivered: '#c8472f', // alert
  cancelled: '#97a0aa', // steel — su comanda ya no existe; no es un fallo de reparto
}

// Stops with usable coordinates, and the count of those without (surfaced, not dropped).
const located = computed(() =>
  props.stops
    .map((stop) => {
      if (stop.latitude === null || stop.longitude === null) return null
      const lat = Number.parseFloat(stop.latitude)
      const lng = Number.parseFloat(stop.longitude)
      return Number.isNaN(lat) || Number.isNaN(lng) ? null : { stop, lat, lng }
    })
    .filter((p): p is { stop: DriverStop; lat: number; lng: number } => p !== null),
)
const unlocatedCount = computed(() => props.stops.length - located.value.length)

const el = ref<HTMLElement | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let map: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let layer: any = null
const loading = ref(true)
const failed = ref(false)

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

function loadLeaflet(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if (w.L) return Promise.resolve()
  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = LEAFLET_CSS
    document.head.appendChild(link)
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('leaflet')))
      return
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('leaflet'))
    document.head.appendChild(script)
  })
}

function draw() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L = (window as any).L
  if (!L || !map) return
  if (layer) layer.clearLayers()
  else layer = L.layerGroup().addTo(map)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pts: any[] = []

  // The driver's own trail (path travelled) — drawn under everything, simplified when long.
  if (props.myTrail.length > 1) {
    const raw = props.myTrail.map((p) => [p.lat, p.lng] as [number, number])
    const line = props.myTrail.length > TRAIL_SIMPLIFY_ABOVE ? simplifyPath(raw) : raw
    L.polyline(line, { color: '#14181c', weight: 3, opacity: 0.45 }).addTo(layer)
  }

  // Live "you are here" — the driver's real position, ember-ringed to read as live. Only when a
  // fix exists (no misleading marker before the first GPS fix).
  if (props.myPosition) {
    const here: [number, number] = [props.myPosition.lat, props.myPosition.lng]
    L.circleMarker(here, {
      radius: 6,
      color: '#f2933b', // ember ring = live
      weight: 3,
      fillColor: '#14181c',
      fillOpacity: 1,
    })
      .bindTooltip('Tú', { direction: 'top', offset: [0, -6] })
      .addTo(layer)
    pts.push(here)
  }

  for (const { stop, lat, lng } of located.value) {
    const isNext = stop.id === props.nextStopId
    const color = POINT_COLOR[stop.delivery_status]
    const label = `${stop.route_position ?? '·'}. ${stop.address_text}`
    const marker = L.circleMarker([lat, lng], {
      radius: isNext ? 10 : 6,
      color: '#ffffff',
      weight: isNext ? 3 : 2,
      fillColor: color,
      fillOpacity: 1,
    })
      .bindTooltip(label, { direction: 'top', offset: [0, -6] })
      .addTo(layer)
    marker.on('click', () => emit('open', stop.id))
    pts.push([lat, lng])
  }
  if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 })
}

onMounted(async () => {
  try {
    await loadLeaflet()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    if (!el.value) return
    // Initial view: the live fix if there is one, else the first located stop, else the fallback.
    const view = props.myPosition
      ? ([props.myPosition.lat, props.myPosition.lng] as [number, number])
      : located.value[0]
        ? ([located.value[0].lat, located.value[0].lng] as [number, number])
        : ([FALLBACK_VIEW.lat, FALLBACK_VIEW.lng] as [number, number])
    map = L.map(el.value, { zoomControl: false, attributionControl: false }).setView(view, 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    draw()
    loading.value = false
  } catch {
    failed.value = true
    loading.value = false
  }
})

watch(
  () =>
    props.stops.map((s) => `${s.id}:${s.delivery_status}`).join('|') +
    `#${props.nextStopId}` +
    `@${props.myPosition ? `${props.myPosition.lat.toFixed(5)},${props.myPosition.lng.toFixed(5)}` : 'x'}` +
    `~${props.myTrail.length}`,
  () => draw(),
)

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl border border-line bg-sunken">
    <div ref="el" class="h-[60dvh] w-full" aria-label="Mapa aproximado de los pedidos" role="img" />

    <div
      v-if="loading"
      class="absolute inset-0 grid place-items-center bg-sunken/80 font-mono text-[12px] text-steel-500"
    >
      <span><i class="pi pi-spin pi-spinner mr-1" /> Cargando mapa…</span>
    </div>
    <div
      v-else-if="failed"
      class="absolute inset-0 grid place-items-center px-6 text-center font-mono text-[12px] text-steel-500"
    >
      No se pudo cargar el mapa. Revisa la conexión.
    </div>

    <!-- Stops without coordinates: surfaced so they aren't silently missing from the map. -->
    <div
      v-if="!failed && unlocatedCount"
      class="pointer-events-none absolute right-2 top-2 rounded-lg border border-line bg-paper/95 px-2.5 py-1.5 font-mono text-[10px] text-steel-600 backdrop-blur"
    >
      <i class="pi pi-map-marker text-[11px] text-steel-400" />
      {{ unlocatedCount }} sin ubicación
    </div>

    <!-- Legend: the state palette, so a colour on the map reads without guessing. -->
    <div
      v-if="!failed"
      class="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-paper/95 px-2.5 py-1.5 font-mono text-[10px] text-steel-600 backdrop-blur"
    >
      <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-ember" />Siguiente</span>
      <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-warn" />Pendiente</span>
      <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-success" />Entregado</span>
      <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-alert" />No entregado</span>
    </div>
  </div>
</template>
