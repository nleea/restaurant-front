<script setup lang="ts">
// Reusable mini-map to pick a delivery point: tap sets the candidate marker.
// Shares the CDN Leaflet loader (and the ember marker style) with the coverage map.
// Inside a PrimeVue Dialog the container mounts at zero size — the parent should
// call invalidate() after the dialog opens (Leaflet-in-modal pitfall).
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ensureLeaflet,
  NO_PIN_VIEW,
  type LCircle,
  type LMap,
} from '@/components/deliveryroutes/useLeafletRings'

const props = defineProps<{
  modelValue: [number, number] | null
  /** Initial view center (the branch's business pin); falls back to the country view. */
  center: [number, number] | null
}>()
const emit = defineEmits<{ 'update:modelValue': [point: [number, number]] }>()

const el = ref<HTMLElement | null>(null)
const loadError = ref(false)
let map: LMap | null = null
let marker: LCircle | null = null
let leafletCircleMarker: ((c: [number, number], o: Record<string, unknown>) => LCircle) | null =
  null

function placeMarker(point: [number, number]) {
  if (!map || !leafletCircleMarker) return
  if (!marker) {
    marker = leafletCircleMarker(point, {
      radius: 8,
      color: '#d97a22', // ember-600
      weight: 3,
      fillColor: '#f2933b', // ember
      fillOpacity: 0.9,
    })
    marker.addTo(map)
    marker.bindTooltip('Punto de entrega', { direction: 'top' })
  } else {
    marker.setLatLng(point)
  }
}

onMounted(async () => {
  if (!el.value) return
  try {
    const leaflet = await ensureLeaflet()
    leafletCircleMarker = leaflet.circleMarker.bind(leaflet)
    map = leaflet.map(el.value, { zoomControl: true, attributionControl: true })
    if (props.modelValue) map.setView(props.modelValue, 15)
    else if (props.center) map.setView(props.center, 13)
    else map.setView(NO_PIN_VIEW.center, NO_PIN_VIEW.zoom)
    leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      })
      .addTo(map)
    if (props.modelValue) placeMarker(props.modelValue)
    map.on('click', (event) => {
      emit('update:modelValue', [event.latlng.lat, event.latlng.lng])
    })
    // Dialogs animate open while we mount: re-measure once the transition settles.
    setTimeout(() => map?.invalidateSize(), 200)
  } catch {
    loadError.value = true
  }
})

// A pasted share sets the point from outside: show it and fly there.
watch(
  () => props.modelValue,
  (point) => {
    if (!point || !map) return
    placeMarker(point)
    map.flyTo(point, 16)
  },
)

onBeforeUnmount(() => {
  map?.remove()
  map = null
  marker = null
})

defineExpose({
  /** Re-measure the container (call after the wrapping dialog opens). */
  invalidate() {
    map?.invalidateSize()
  },
})
</script>

<template>
  <div class="relative">
    <div ref="el" class="h-56 w-full rounded-lg border border-line bg-sunken" />
    <p
      v-if="loadError"
      class="absolute inset-0 grid place-items-center rounded-lg bg-sunken text-sm text-steel-500"
    >
      No se pudo cargar el mapa.
    </p>
  </div>
</template>
