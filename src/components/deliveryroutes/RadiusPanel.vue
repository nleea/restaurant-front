<script setup lang="ts">
// Radius configurator + the page's signature: a live "radar" — an SVG miniature of the map's
// concentric rings that redraws with the slider and highlights the selected route. The legend
// IS the map, one glance ties color → route → distance.
import { computed } from 'vue'
import type { DeliveryRoute } from '@/lib/deliveryRoutes'
import {
  RING_STEP_MAX_KM,
  RING_STEP_MIN_KM,
  ringRangeLabel,
  routeCode,
} from '@/lib/deliveryRoutes'

const props = defineProps<{
  routes: DeliveryRoute[]
  stepKm: number
  selectedId: string | null
  open: boolean
  /** Without `delivery.manage`: the radar reads, nothing writes. */
  readonly?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:stepKm', value: number): void
  (e: 'update:open', value: boolean): void
  (e: 'select', routeId: string): void
  (e: 'relocate'): void
}>()

const RADAR_SIZE = 116
const RADAR_MAX_R = 52

const radarRings = computed(() =>
  props.routes.map((route, index) => ({
    route,
    r: ((index + 1) / Math.max(1, props.routes.length)) * RADAR_MAX_R,
    selected: route.id === props.selectedId,
  })),
)

function onSlider(event: Event) {
  emit('update:stepKm', Number((event.target as HTMLInputElement).value))
}
function onNumber(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  emit('update:stepKm', Math.min(RING_STEP_MAX_KM, Math.max(RING_STEP_MIN_KM, value)))
}
</script>

<template>
  <section
    class="pointer-events-auto w-[300px] overflow-hidden rounded-2xl bg-paper shadow-[0_18px_44px_-18px_rgb(0_0_0/0.45)] ring-1 ring-black/10"
  >
    <!-- Header rides a graphite strip: the instrument chrome of the station -->
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 bg-graphite-900 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      :aria-expanded="open"
      @click="emit('update:open', !open)"
    >
      <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/80">
        Radios de ruta
      </span>
      <span class="flex items-center gap-2">
        <span class="font-mono text-[11px] font-bold tabular-nums text-ember">{{ stepKm }} km</span>
        <i class="pi text-[10px] text-paper/50" :class="open ? 'pi-chevron-down' : 'pi-chevron-up'" />
      </span>
    </button>

    <div v-if="open" class="flex flex-col gap-3 p-3.5">
      <div class="flex items-start gap-3.5">
        <!-- The radar: the map's rings in miniature, live -->
        <svg
          :width="RADAR_SIZE"
          :height="RADAR_SIZE"
          :viewBox="`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`"
          class="shrink-0"
          role="img"
          aria-label="Vista en miniatura de los anillos de ruta"
        >
          <g v-for="ring in [...radarRings].reverse()" :key="ring.route.id">
            <circle
              :cx="RADAR_SIZE / 2"
              :cy="RADAR_SIZE / 2"
              :r="ring.r"
              :stroke="ring.route.color"
              :stroke-width="ring.selected ? 3 : 1.5"
              :stroke-opacity="ring.selected ? 1 : ring.route.isActive ? 0.75 : 0.3"
              :fill="ring.route.color"
              :fill-opacity="ring.selected ? 0.14 : 0.05"
              class="cursor-pointer transition-all duration-200"
              @click="emit('select', ring.route.id)"
            />
          </g>
          <circle :cx="RADAR_SIZE / 2" :cy="RADAR_SIZE / 2" r="3.5" fill="#d97a22" />
        </svg>

        <!-- Legend: code · name · computed band, in instrument mono -->
        <ul class="min-w-0 flex-1 space-y-1">
          <li v-for="(route, i) in routes" :key="route.id">
            <button
              type="button"
              class="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left transition hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              :class="route.id === selectedId ? 'bg-ember-50' : ''"
              @click="emit('select', route.id)"
            >
              <span class="h-2 w-2 shrink-0 self-center rounded-full" :style="{ background: route.color }" />
              <span class="shrink-0 font-mono text-[10px] font-bold text-steel-500">{{ routeCode(route.name) }}</span>
              <span class="min-w-0 flex-1 truncate text-[11px]" :class="route.isActive ? 'text-ink' : 'text-steel-400 line-through'">
                {{ route.name.replace(/^Ruta\s+/i, '') }}
              </span>
              <span class="shrink-0 font-mono text-[10px] tabular-nums text-steel-500">
                {{ ringRangeLabel(i, stepKm) }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="!readonly" class="flex items-center gap-2.5">
        <input
          type="range"
          :min="RING_STEP_MIN_KM"
          :max="RING_STEP_MAX_KM"
          step="0.5"
          :value="stepKm"
          class="flex-1 accent-[#f2933b]"
          aria-label="Radio por ruta en kilómetros"
          @input="onSlider"
        />
        <input
          type="number"
          :min="RING_STEP_MIN_KM"
          :max="RING_STEP_MAX_KM"
          step="0.5"
          :value="stepKm"
          class="w-16 rounded-lg border border-line bg-surface px-2 py-1 text-right font-mono text-[12px] tabular-nums text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          aria-label="Radio por ruta, entrada numérica"
          @change="onNumber"
        />
        <span class="font-mono text-[11px] text-steel-500">km</span>
      </div>

      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] leading-snug text-muted">
          Las rutas se reparten en anillos consecutivos desde tu negocio.
        </p>
        <button
          v-if="!readonly"
          type="button"
          class="shrink-0 rounded-lg border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-steel-600 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          @click="emit('relocate')"
        >
          <i class="pi pi-map-marker text-[9px]" /> Reubicar
        </button>
      </div>
    </div>
  </section>
</template>
