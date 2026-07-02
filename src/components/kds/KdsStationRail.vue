<script setup lang="ts">
import type { StationMeta } from '@/lib/kds/types'
import { useKdsBoard } from './useKdsBoard'

defineProps<{ light: boolean }>()
const board = useKdsBoard()

function tooltip(m: StationMeta): string {
  const comps = board.stationActiveCount(m.id)
  const orders = board.stationOrderCount(m.id)
  return `${comps} componentes activos en ${m.label} · ${orders} comandas`
}
</script>

<template>
  <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
    <!-- All -->
    <button
      type="button"
      class="shrink-0 rounded-xl border px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      :class="
        board.activeStation.value === null
          ? 'border-ember/60 bg-ember/15 text-ember'
          : light
            ? 'border-line bg-surface text-steel-600 hover:bg-sunken'
            : 'border-white/10 bg-white/[0.03] text-paper/70 hover:bg-white/[0.07]'
      "
      @click="board.setStation(null)"
    >
      Todas
    </button>

    <button
      v-for="m in board.stations.value"
      :key="m.id"
      type="button"
      :title="tooltip(m)"
      class="group flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      :class="
        board.activeStation.value === m.id
          ? 'border-ember/60 bg-ember/15'
          : light
            ? 'border-line bg-surface hover:bg-sunken'
            : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
      "
      @click="board.setStation(m.id)"
    >
      <span
        class="font-mono text-[12px] font-bold uppercase tracking-wide"
        :class="
          board.activeStation.value === m.id ? 'text-ember' : light ? 'text-ink' : 'text-paper/80'
        "
      >
        {{ m.tag }}
      </span>
      <span
        class="grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
        :class="
          board.stationActiveCount(m.id) > 0
            ? 'bg-ember text-graphite-900'
            : light
              ? 'bg-sunken text-steel-500'
              : 'bg-white/10 text-paper/40'
        "
      >
        {{ board.stationActiveCount(m.id) }}
      </span>
      <!-- alert dot -->
      <span
        v-if="board.stationHasAlert(m.id)"
        class="h-1.5 w-1.5 rounded-full bg-alert"
        aria-label="alertas activas"
      />
    </button>
  </div>
</template>
