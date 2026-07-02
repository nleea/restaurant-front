<script setup lang="ts">
import { computed } from 'vue'
import { formatCOP } from '@/lib/money'
import { elapsedMinutesFromMs, formatMinutes, heatLevel } from '@/lib/kitchenTime'
import type { TableVM } from '@/lib/floorModel'

const props = withDefaults(defineProps<{ vm: TableVM; selected: boolean; now?: number }>(), {
  now: () => Date.now(),
})
const emit = defineEmits<{ select: [] }>()

const table = computed(() => props.vm.table)

// Seats hug the docket's top and bottom edges, split across the two rows.
const topSeats = computed(() => Math.ceil(table.value.capacity / 2))
const bottomSeats = computed(() => Math.floor(table.value.capacity / 2))

// Backend tables are binary: occupied (has an open order) or free.
const s = computed(() =>
  props.vm.isOccupied
    ? { label: 'Ocupada', border: 'border-l-ember', seat: 'bg-ember/70', dot: 'bg-ember', text: 'text-ember-600' }
    : { label: 'Libre', border: 'border-l-success', seat: 'bg-steel-300', dot: 'bg-success', text: 'text-success' },
)

// --- Kitchen readiness cue (only when the backing order has been routed) ----
const isReady = computed(() => props.vm.kitchenState === 'ready')
const inKitchen = computed(() => props.vm.kitchenState === 'in_kitchen')

// Cooling timer: minutes since the order was fully up (max ready_at), escalating as it sits.
const readyMin = computed(() =>
  isReady.value ? elapsedMinutesFromMs(props.vm.progress?.readySinceMs ?? null, props.now) : null,
)
const readyHeat = computed(() => heatLevel(readyMin.value))
const readySince = computed(() => {
  const m = readyMin.value
  if (m === null) return ''
  return m < 1 ? 'recién' : `hace ${formatMinutes(m)}`
})
// El Pase escalation: fresh → success, warming → ember, overdue → alert.
const readyTone = computed(() =>
  readyHeat.value === 'hot' ? 'text-alert' : readyHeat.value === 'warm' ? 'text-ember' : 'text-success',
)
const readyBorder = computed(() =>
  readyHeat.value === 'hot'
    ? 'border-l-alert'
    : readyHeat.value === 'warm'
      ? 'border-l-ember'
      : 'border-l-success',
)
</script>

<template>
  <button
    type="button"
    :aria-pressed="selected"
    :aria-label="`Mesa ${table.number}, ${s.label}${isReady ? ', comida lista' : inKitchen ? ', en cocina' : ''}`"
    class="group flex w-full flex-col items-stretch rounded-2xl focus-visible:outline-none"
    @click="emit('select')"
  >
    <!-- Top chairs -->
    <span class="flex h-2 items-end justify-center gap-1.5 px-6" aria-hidden="true">
      <span v-for="i in topSeats" :key="`t${i}`" class="h-2 w-5 rounded-t-full transition-colors" :class="s.seat" />
    </span>

    <!-- The docket -->
    <span
      class="card relative flex flex-col gap-2 border-l-4 px-4 py-3.5 transition"
      :class="[
        isReady ? readyBorder : s.border,
        isReady && readyHeat === 'fresh' ? 'pulse-ready' : '',
        selected ? 'ring-2 ring-ember/50' : 'group-hover:-translate-y-0.5',
      ]"
    >
      <span class="flex items-start justify-between">
        <span class="font-mono text-3xl font-semibold leading-none tracking-tight text-ink tabular-nums">
          {{ table.number }}
        </span>
        <span class="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-steel-500">
          <i class="pi pi-users text-[10px]" />{{ table.capacity }}
        </span>
      </span>

      <span class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5 text-xs font-medium" :class="s.text">
          <span class="size-1.5 rounded-full" :class="s.dot" />
          {{ s.label }}
        </span>
        <span v-if="vm.isOccupied" class="font-mono text-xs tabular-nums text-steel-600">
          {{ formatCOP(vm.total) }}
        </span>
      </span>

      <!-- Kitchen readiness: cooking progress or the "ready to pick up" cooling timer -->
      <span v-if="isReady" class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold" :class="readyTone">
          <span aria-hidden="true">🔔</span> Lista, recoger
        </span>
        <span v-if="readySince" class="font-mono text-[11px] tabular-nums" :class="readyTone">
          {{ readySince }}
        </span>
      </span>
      <span v-else-if="inKitchen" class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5 text-xs font-medium text-ember-600">
          <i class="pi pi-clock text-[10px]" /> En cocina
        </span>
        <span v-if="vm.progress" class="font-mono text-[11px] tabular-nums text-steel-600">
          {{ vm.progress.ready }}/{{ vm.progress.total }}
        </span>
      </span>
    </span>

    <!-- Bottom chairs -->
    <span class="flex h-2 items-start justify-center gap-1.5 px-6" aria-hidden="true">
      <span v-for="i in bottomSeats" :key="`b${i}`" class="h-2 w-5 rounded-b-full transition-colors" :class="s.seat" />
    </span>
  </button>
</template>
