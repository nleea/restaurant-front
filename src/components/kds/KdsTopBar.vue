<script setup lang="ts">
import { computed } from 'vue'
import { useKdsBoard } from './useKdsBoard'

defineProps<{ light: boolean }>()
const board = useKdsBoard()

const clockText = computed(() =>
  new Date(board.clock.value).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }),
)
</script>

<template>
  <header class="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
    <!-- Brand + live clock -->
    <div class="flex items-center gap-3">
      <span class="font-display text-lg font-extrabold tracking-tight text-paper">El Pase</span>
      <span class="h-4 w-px bg-white/15" />
      <span class="font-mono text-[15px] font-bold tabular-nums text-ember">{{ clockText }}</span>
    </div>

    <!-- Pagination -->
    <div v-if="board.pageCount.value > 1" class="flex items-center gap-2">
      <button
        type="button"
        class="rounded px-1.5 py-0.5 font-mono text-sm text-paper/60 transition hover:bg-white/10 disabled:opacity-30"
        :disabled="board.page.value === 0"
        @click="board.page.value--"
      >
        ‹
      </button>
      <span class="font-mono text-[12px] tabular-nums text-paper/70">
        Página {{ board.page.value + 1 }} de {{ board.pageCount.value }}
      </span>
      <button
        type="button"
        class="rounded px-1.5 py-0.5 font-mono text-sm text-paper/60 transition hover:bg-white/10 disabled:opacity-30"
        :disabled="board.page.value >= board.pageCount.value - 1"
        @click="board.page.value++"
      >
        ›
      </button>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <!-- View mode: all vs my station -->
      <div class="flex items-center rounded-lg border border-white/10 p-0.5">
        <button
          type="button"
          class="rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition"
          :class="board.viewMode.value === 'all' ? 'bg-white/10 text-paper' : 'text-paper/50'"
          @click="board.viewMode.value = 'all'"
        >
          Pase
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition"
          :class="board.viewMode.value === 'mystation' ? 'bg-white/10 text-paper' : 'text-paper/50'"
          @click="board.viewMode.value = 'mystation'"
        >
          Mi estación
        </button>
      </div>

      <select
        v-if="board.viewMode.value === 'mystation'"
        v-model="board.myStation.value"
        class="rounded-lg border border-white/10 bg-graphite-800 px-2 py-1.5 font-mono text-[11px] uppercase tracking-wide text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      >
        <option v-for="m in board.stations.value" :key="m.id" :value="m.id">{{ m.label }}</option>
      </select>

      <!-- Ready dockets: hidden by default, shown on demand with a live count -->
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        :class="
          board.showReady.value
            ? 'border-ember/60 bg-ember/15 text-ember'
            : 'border-white/10 text-paper/70 hover:bg-white/10'
        "
        :aria-pressed="board.showReady.value"
        @click="board.toggleShowReady()"
      >
        Listas
        <span
          class="grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          :class="board.readyCount.value > 0 ? 'bg-success text-graphite-900' : 'bg-white/10 text-paper/40'"
        >
          {{ board.readyCount.value }}
        </span>
      </button>

      <!-- Layout toggle -->
      <button
        type="button"
        class="rounded-lg border border-white/10 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-paper/70 transition hover:bg-white/10"
        @click="board.toggleLayout()"
      >
        {{ board.layout.value === 'grid' ? 'Cuadrícula' : 'Lista' }}
      </button>

      <!-- Theme toggle -->
      <button
        type="button"
        class="rounded-lg border border-white/10 px-2.5 py-1.5 text-[13px] text-paper/70 transition hover:bg-white/10"
        :title="light ? 'Cambiar a modo pase' : 'Cambiar a modo claro'"
        @click="board.toggleTheme()"
      >
        {{ light ? '☾' : '☀' }}
      </button>

      <!-- Expo -->
      <button
        type="button"
        class="relative flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        :class="board.alertCount.value > 0 ? 'bg-alert text-white hover:bg-alert-600' : 'border border-white/10 text-paper/60'"
        @click="board.expoOpen.value = !board.expoOpen.value"
      >
        Expo
        <span
          v-if="board.alertCount.value > 0"
          class="grid min-w-5 place-items-center rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-alert"
        >
          {{ board.alertCount.value }}
        </span>
      </button>
    </div>
  </header>
</template>
