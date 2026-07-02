<script setup lang="ts">
import { useKdsBoard } from './useKdsBoard'

const board = useKdsBoard()
</script>

<template>
  <Transition name="kds-expo">
    <section
      v-if="board.expoOpen.value && board.expo.value.length"
      class="border-b border-alert bg-graphite-900"
    >
      <div class="mx-auto max-w-[1600px] px-4 py-3">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="font-display text-sm font-extrabold uppercase tracking-wide text-white">
            🚨 Marchar ahora
          </h2>
          <button
            type="button"
            class="rounded px-2 py-0.5 font-mono text-sm text-paper/60 transition hover:bg-white/10"
            aria-label="Cerrar expo"
            @click="board.expoOpen.value = false"
          >
            ×
          </button>
        </div>

        <ul class="space-y-1">
          <li
            v-for="row in board.expo.value"
            :key="`${row.orderId}-${row.itemId}`"
            class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/[0.06]"
            :class="{
              'bg-alert/25': row.alert.severity === 'critical',
              'bg-alert/10': row.alert.severity === 'urgent',
              'bg-warn/10': row.alert.severity === 'warn',
            }"
            @click="board.focusOrder(row.orderId, row.itemId)"
          >
            <span class="w-8 shrink-0 font-mono text-[12px] font-bold text-paper">{{ row.table }}</span>
            <span class="w-16 shrink-0 font-mono text-[11px] tabular-nums text-paper/60">#{{ row.orderId.slice(-6) }}</span>
            <span class="min-w-0 flex-1 truncate text-[13px] text-paper">{{ row.itemName }}</span>
            <span class="shrink-0 font-mono text-[11px] uppercase tracking-wide text-paper/70">
              → {{ board.stationMeta(row.alert.waitingStation).tag }} {{ row.alert.coldName }}
            </span>
            <span
              class="w-16 shrink-0 text-center font-mono text-[10px] font-bold uppercase tracking-wide"
              :class="row.alert.severity === 'warn' ? 'text-warn-600' : 'text-alert-600'"
            >
              {{ row.alert.severity === 'warn' ? 'espera' : row.alert.severity }}
            </span>
            <span class="w-12 shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-white">{{ row.alert.minutes }} min</span>
          </li>
        </ul>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.kds-expo-enter-active,
.kds-expo-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.kds-expo-enter-from,
.kds-expo-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
@media (prefers-reduced-motion: reduce) {
  .kds-expo-enter-active,
  .kds-expo-leave-active {
    transition: none;
  }
}
</style>
