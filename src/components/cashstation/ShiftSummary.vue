<script setup lang="ts">
// Zona C — the running arqueo docket. Perforated top edge (the tally you tear
// off at cierre); ingresos/egresos ledger; the drawer total as the one ember
// hero; payment methods as a single ember→steel mono ramp (not rainbow dots).
import { computed } from 'vue'
import MoneyTicker from './MoneyTicker.vue'
import { cash, summary, channels, methods } from '@/lib/cashStation'
import { cop } from '@/lib/cop'

withDefaults(defineProps<{ canClose?: boolean }>(), { canClose: true })
const emit = defineEmits<{ close: [] }>()

// Payment bars share one hue axis (ember → steel by rank): the emphasis is
// magnitude, not category identity — the de-rainbow move.
const methodRows = computed(() => {
  const n = methods.value.length
  return methods.value.map((m, i) => {
    const t = n > 1 ? 1 - i / (n - 1) : 1
    return { ...m, color: `color-mix(in oklab, var(--color-ember) ${Math.round(20 + t * 60)}%, var(--color-steel-500))` }
  })
})
</script>

<template>
  <aside class="card overflow-hidden lg:sticky lg:top-4">
    <div class="docket-perf h-[7px] w-full" />
    <div class="flex flex-col gap-4 p-5">
      <header>
        <p class="eyebrow">Resumen del turno</p>
        <p class="mt-1 font-mono text-[11px] text-steel-500">
          Hoy · desde {{ new Date(cash.openedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }) }}
        </p>
      </header>

      <!-- Ingresos -->
      <section>
        <p class="mb-2 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
          Ingresos
        </p>
        <dl class="flex flex-col gap-1.5 text-[13px]">
          <div class="flex items-baseline justify-between">
            <dt class="text-ink">Ventas totales</dt>
            <dd class="font-mono font-semibold tabular-nums text-ink"><MoneyTicker :value="cash.salesTotal" :format="cop" /></dd>
          </div>
          <div v-for="c in channels" :key="c.key" class="flex items-baseline justify-between pl-3 text-steel-500">
            <dt class="flex items-center gap-1.5">
              <span class="h-3 w-px bg-line" />{{ c.label }}
            </dt>
            <dd class="font-mono tabular-nums">
              {{ cop(c.value) }}<span class="ml-2 inline-block w-8 text-right text-[11px] text-steel-400">{{ Math.round(c.pct) }}%</span>
            </dd>
          </div>
          <div class="flex items-baseline justify-between">
            <dt class="text-ink">Entradas manuales</dt>
            <dd class="font-mono tabular-nums text-ink"><MoneyTicker :value="cash.manualEntries" :format="cop" /></dd>
          </div>
        </dl>
        <div class="mt-2 flex items-baseline justify-between border-t border-dashed border-line pt-2">
          <span class="font-mono text-[11px] uppercase tracking-wide text-steel-500">Total entradas</span>
          <span class="font-mono text-sm font-bold tabular-nums text-success-600">+<MoneyTicker :value="summary.totalIn.value" :format="cop" /></span>
        </div>
      </section>

      <!-- Egresos -->
      <section>
        <p class="mb-2 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
          Egresos
        </p>
        <dl class="flex flex-col gap-1.5 text-[13px]">
          <div class="flex items-baseline justify-between">
            <dt class="text-ink">Retiros</dt>
            <dd class="font-mono tabular-nums text-alert-600">−<MoneyTicker :value="cash.withdrawals" :format="cop" /></dd>
          </div>
          <div class="flex items-baseline justify-between">
            <dt class="text-ink">Gastos registrados</dt>
            <dd class="font-mono tabular-nums text-alert-600">−<MoneyTicker :value="cash.expenses" :format="cop" /></dd>
          </div>
        </dl>
        <div class="mt-2 flex items-baseline justify-between border-t border-dashed border-line pt-2">
          <span class="font-mono text-[11px] uppercase tracking-wide text-steel-500">Total egresos</span>
          <span class="font-mono text-sm font-bold tabular-nums text-alert-600">−<MoneyTicker :value="summary.totalOut.value" :format="cop" /></span>
        </div>
      </section>

      <!-- The drawer total: the one ember hero -->
      <div class="rounded-xl border border-ember/30 bg-ember-50 px-4 py-3.5 text-center heat-warm">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-ember-600">Efectivo estimado en caja</p>
        <p class="mt-1 font-display text-3xl font-bold tabular-nums text-ember-600">
          $<MoneyTicker :value="summary.expectedCash.value" :format="(n) => Math.round(n).toLocaleString('es-CO')" />
        </p>
      </div>

      <!-- Payment methods — one ember→steel ramp (hidden when no shift summary) -->
      <section v-if="methodRows.length">
        <p class="mb-2.5 border-b border-line pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
          Métodos de pago
        </p>
        <div class="flex flex-col gap-2">
          <div v-for="m in methodRows" :key="m.key" class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between text-[12px]">
              <span class="text-ink">{{ m.label }}</span>
              <span class="font-mono tabular-nums text-steel-600">{{ cop(m.value) }} · {{ Math.round(m.pct) }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-sunken">
              <div class="h-full rounded-full transition-all" :style="{ width: m.pct + '%', backgroundColor: m.color }" />
            </div>
          </div>
        </div>
      </section>

      <!-- Tickets -->
      <section class="grid grid-cols-4 gap-2 rounded-xl bg-sunken/50 p-3 text-center">
        <div v-for="t in [
            { k: 'Abiertos', v: cash.ticketsOpen, money: false },
            { k: 'Completados', v: cash.ticketsDone, money: false },
            { k: 'Cancelados', v: cash.ticketsCancelled, money: false },
            { k: 'Prom.', v: summary.ticketAvg.value, money: true },
          ]" :key="t.k">
          <p class="font-mono text-sm font-bold tabular-nums text-ink">
            <template v-if="t.money">{{ cop(t.v) }}</template>
            <template v-else>{{ t.v }}</template>
          </p>
          <p class="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-steel-500">{{ t.k }}</p>
        </div>
      </section>

      <button
        v-if="canClose"
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-xl border border-alert/30 bg-alert/5 py-3 text-sm font-semibold text-alert-600 transition hover:bg-alert/10"
        @click="emit('close')"
      >
        <i class="pi pi-lock text-xs" /> Cerrar caja
      </button>
    </div>
  </aside>
</template>
