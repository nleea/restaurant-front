<script setup lang="ts">
// Zona B — the movement tape. A live receipt roll that prints newest-first: each
// arriving movement slides in and flashes once. Direction is the only color —
// in = success, out = alert — so the tape scans like a register ribbon.
import { computed, ref } from 'vue'
import { cash, type MovementKind } from '@/lib/cashStation'
import { cop } from '@/lib/cop'

withDefaults(defineProps<{ canRegister?: boolean }>(), { canRegister: true })
const emit = defineEmits<{ register: [Extract<MovementKind, 'entry' | 'withdrawal' | 'expense'>] }>()

const FILTERS: { key: 'all' | MovementKind; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'sale', label: 'Ventas' },
  { key: 'withdrawal', label: 'Retiros' },
  { key: 'expense', label: 'Gastos' },
  { key: 'entry', label: 'Entradas' },
]
const filter = ref<'all' | MovementKind>('all')

const filtered = computed(() =>
  filter.value === 'all' ? cash.movements : cash.movements.filter((m) => m.kind === filter.value),
)

const PER_PAGE = 8
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))

function setFilter(k: 'all' | MovementKind) {
  filter.value = k
  page.value = 1
}

const ACTIONS = [
  { kind: 'entry' as const, label: 'Registrar entrada', icon: 'pi-arrow-up', cls: 'border-success/30 bg-success/8 text-success-600 hover:bg-success/14' },
  { kind: 'withdrawal' as const, label: 'Registrar retiro', icon: 'pi-arrow-down', cls: 'border-alert/30 bg-alert/8 text-alert-600 hover:bg-alert/14' },
  { kind: 'expense' as const, label: 'Registrar gasto', icon: 'pi-wallet', cls: 'border-ember/40 bg-ember-50 text-ember-600 hover:bg-ember-100' },
]
</script>

<template>
  <section class="card flex min-h-0 flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3.5 sm:px-5">
      <h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-steel-600">
        Movimientos del turno
      </h2>
      <span class="pill pill-success">
        <span class="relative flex size-1.5">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-success/70" />
          <span class="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        En vivo
      </span>
      <span class="ml-auto font-mono text-[11px] tabular-nums text-steel-500">
        {{ cash.movements.length }} movimientos
      </span>
    </div>

    <!-- Register actions -->
    <div v-if="canRegister" class="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
      <button
        v-for="a in ACTIONS"
        :key="a.kind"
        type="button"
        class="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition"
        :class="a.cls"
        @click="emit('register', a.kind)"
      >
        <i :class="['pi', a.icon, 'text-[11px]']" />{{ a.label }}
      </button>
    </div>

    <!-- Filter pills -->
    <div class="flex flex-wrap gap-1.5 px-4 py-2.5 sm:px-5">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        class="rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition"
        :class="filter === f.key ? 'bg-graphite-900 text-white' : 'bg-sunken text-steel-500 hover:text-ink'"
        @click="setFilter(f.key)"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Tape -->
    <ul class="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
      <li
        v-for="m in shown"
        :key="m.id"
        class="flex items-start gap-3 px-4 py-3 transition-colors sm:px-5"
        :class="m.fresh ? 'flash-in' : 'hover:bg-sunken/50'"
      >
        <span
          class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"
          :class="m.amount >= 0 ? 'bg-success/12 text-success-600' : 'bg-alert/12 text-alert-600'"
        >
          <i :class="['pi', m.amount >= 0 ? 'pi-arrow-up' : 'pi-arrow-down', 'text-[11px]']" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-3">
            <p class="truncate text-[13px] font-medium text-ink">{{ m.concept }}</p>
            <span
              class="shrink-0 font-mono text-[13px] font-semibold tabular-nums"
              :class="m.amount >= 0 ? 'text-success-600' : 'text-alert-600'"
            >
              {{ m.amount >= 0 ? '+' : '−' }}{{ cop(m.amount) }}
            </span>
          </div>
          <div class="mt-0.5 flex items-baseline justify-between gap-3">
            <p class="truncate text-[11px] text-steel-500">
              {{ m.detail }}<span v-if="m.person" class="text-steel-400"> · {{ m.person }}</span>
            </p>
            <span class="shrink-0 font-mono text-[10px] tabular-nums text-steel-400">{{ m.time }}</span>
          </div>
        </div>
      </li>
      <li v-if="!shown.length" class="px-5 py-10 text-center font-mono text-[12px] text-steel-400">
        Sin movimientos para este filtro.
      </li>
    </ul>

    <!-- Pagination -->
    <div
      v-if="pageCount > 1"
      class="flex items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5"
    >
      <button
        type="button"
        :disabled="page === 1"
        class="rounded-lg px-2.5 py-1 font-mono text-[11px] text-steel-600 transition hover:bg-sunken disabled:opacity-30"
        @click="page -= 1"
      >
        ← Anterior
      </button>
      <span class="font-mono text-[11px] tabular-nums text-steel-500">
        Página {{ page }} / {{ pageCount }} · {{ filtered.length }} mov.
      </span>
      <button
        type="button"
        :disabled="page === pageCount"
        class="rounded-lg px-2.5 py-1 font-mono text-[11px] text-steel-600 transition hover:bg-sunken disabled:opacity-30"
        @click="page += 1"
      >
        Siguiente →
      </button>
    </div>
  </section>
</template>

<style scoped>
@keyframes flash-in {
  0% {
    opacity: 0;
    transform: translateY(-12px);
    background-color: color-mix(in oklab, var(--color-success) 16%, transparent);
  }
  60% {
    opacity: 1;
    transform: none;
  }
  100% {
    background-color: transparent;
  }
}
.flash-in {
  animation: flash-in 1.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .flash-in {
    animation: none;
  }
}
</style>
