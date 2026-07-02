<script setup lang="ts">
import { computed } from 'vue'
import {
  itemAlert,
  orderElapsedMin,
  orderProgress,
  orderSeverity,
  orderStatus,
  isLate,
  timeHeat,
} from '@/lib/kds/logic'
import { LATE_AFTER_MIN, type KdsOrder } from '@/lib/kds/types'
import KdsItemRow from './KdsItemRow.vue'
import { useKdsBoard } from './useKdsBoard'

const props = defineProps<{ order: KdsOrder; now: number; light: boolean }>()
const board = useKdsBoard()

const status = computed(() => orderStatus(props.order))
const severity = computed(() => orderSeverity(props.order, props.now))
const elapsed = computed(() => orderElapsedMin(props.order, props.now))
const progress = computed(() => orderProgress(props.order))
const heat = computed(() => timeHeat(props.order, props.now))
const late = computed(() => isLate(props.order, props.now))
const alertingItems = computed(() => props.order.items.filter((i) => itemAlert(i, props.now)).length)

const typeIcon = computed(() => ({ dinein: '🍽', delivery: '🛵', takeout: '📦' })[props.order.type])
const heading = computed(() =>
  props.order.type === 'takeout'
    ? 'Para llevar'
    : props.order.type === 'delivery'
      ? 'Domicilio'
      : props.order.table
        ? `Mesa ${props.order.table.replace('T', '')}`
        : 'Mesa —',
)

// Header strip: the order's state, encoded in heat/state color only (no yellow/red rainbow).
const stripClass = computed(() => {
  if (status.value === 'completed') return 'bg-steel-400'
  if (status.value === 'ready') return 'bg-success'
  if (status.value === 'in_progress') return 'bg-ember'
  return props.light ? 'bg-line' : 'bg-white/20'
})

// Ring: critical breathes under the lamp; ready breathes a success halo; warm glows faintly.
const ringClass = computed(() => {
  if (status.value === 'completed') return ''
  if (severity.value === 'critical') return 'heat-hot'
  if (status.value === 'ready') return 'pulse-ready'
  if (heat.value === 'warm') return 'heat-warm'
  return ''
})

const barClass = computed(() =>
  heat.value === 'hot' ? 'bg-alert' : heat.value === 'warm' ? 'bg-ember' : 'bg-success',
)

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })
}
</script>

<template>
  <article
    :id="`kds-order-${order.id}`"
    class="animate-docket flex min-w-0 flex-col overflow-hidden rounded-2xl transition"
    :class="[
      light ? 'bg-paper ring-1 ring-black/5' : 'bg-paper ring-1 ring-black/20',
      status === 'completed' ? 'opacity-45' : '',
      ringClass,
    ]"
  >
    <!-- Bump affordance: advance everything left on this order to ready (kitchen.update only) -->
    <div
      v-if="board.canUpdate.value && status !== 'completed' && status !== 'ready'"
      class="flex justify-end bg-graphite-900 px-3 pt-2"
    >
      <button
        type="button"
        class="rounded border border-white/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-paper/70 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:opacity-40"
        :disabled="board.isBumping(order.id)"
        @click="board.bump(order.id)"
      >
        {{ board.isBumping(order.id) ? 'Marchando…' : 'Marchar todo' }}
      </button>
    </div>

    <div class="docket-perf h-2 w-full bg-graphite-900" />
    <div class="h-[3px] w-full" :class="stripClass" />

    <!-- Header: where it goes · alert · order no + waiter -->
    <header class="flex items-start justify-between gap-2 px-4 pt-3">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-[15px] leading-none">{{ typeIcon }}</span>
          <h3 class="truncate font-display text-lg font-extrabold leading-tight text-ink">{{ heading }}</h3>
        </div>
        <span v-if="order.guests > 0" class="font-mono text-[11px] tabular-nums text-steel-500">{{ order.guests }} pax</span>
      </div>

      <div v-if="severity !== 'none'" class="flex shrink-0 items-center gap-1.5 self-center">
        <span
          class="h-2 w-2 rounded-full"
          :class="severity === 'warn' ? 'bg-warn' : 'bg-alert'"
        />
        <span
          class="font-mono text-[11px] font-bold uppercase tracking-wide"
          :class="severity === 'warn' ? 'text-warn-600' : 'text-alert-600'"
        >
          {{ alertingItems }} {{ severity === 'warn' ? 'espera' : severity === 'urgent' ? 'urgente' : 'crítico' }}
        </span>
      </div>

      <div class="min-w-0 shrink-0 text-right">
        <span class="block truncate font-mono text-[12px] font-bold tabular-nums text-ink">#{{ order.id.slice(-6) }}</span>
        <span v-if="order.waiter" class="block truncate text-[11px] text-steel-500">Atiende {{ order.waiter }}</span>
      </div>
    </header>

    <hr class="mx-4 mt-2 border-line" />

    <!-- Items -->
    <div class="flex-1 px-4">
      <KdsItemRow
        v-for="item in order.items"
        :key="item.id"
        :order-id="order.id"
        :item="item"
        :now="now"
      />
    </div>

    <!-- Late banner -->
    <div
      v-if="late"
      class="bg-alert py-1 text-center font-mono text-[11px] font-medium text-white"
    >
      ⚠ Esta comanda lleva {{ elapsed - LATE_AFTER_MIN }} min de retraso
    </div>

    <!-- Footer: fired · heat bar · elapsed -->
    <footer class="flex items-center gap-3 border-t border-line px-4 py-2.5">
      <span class="shrink-0 font-mono text-[11px] tabular-nums text-steel-500">{{ fmtTime(order.startedAt) }}</span>
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
        <span
          class="block h-full rounded-full transition-all duration-500"
          :class="barClass"
          :style="{ width: `${Math.round(progress * 100)}%` }"
        />
      </div>
      <span
        class="shrink-0 font-mono text-[12px] font-bold tabular-nums"
        :class="heat === 'hot' ? 'text-alert' : heat === 'warm' ? 'text-ember' : 'text-steel-500'"
      >
        {{ elapsed }} min
      </span>
    </footer>
  </article>
</template>
