<script setup lang="ts">
// "Mi día": a summary of the CURRENT run's settled stops (entregados / no entregados / recaudado
// en efectivo) then each settled stop as a row. The real delivery API exposes only the active run
// — there is no "my finished runs today" endpoint yet (a follow-up), so this never fabricates
// cross-run history; when there's no active run it shows an empty state.
import { computed } from 'vue'
import { formatCOP } from '@/lib/money'
import { useDriverStore } from '@/stores/driver'
import StatusPill from './StatusPill.vue'
import type { DriverStop } from '@/services/delivery.api'

const driver = useDriverStore()

// A settled stop's stamp: the time of its delivered_at, HH:MM (or a dash while unstamped).
function stampOf(stop: DriverStop): string {
  if (!stop.delivered_at) return '—'
  const d = new Date(stop.delivered_at)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

const hasActivity = computed(() => driver.hasRun)
</script>

<template>
  <section>
    <p class="eyebrow">Mi día</p>
    <h2 class="mt-0.5 font-display text-hero font-extrabold leading-tight text-ink">Resumen de hoy</h2>

    <template v-if="hasActivity">
      <!-- Summary strip (current run) -->
      <dl class="mt-3 grid grid-cols-2 gap-2">
        <div class="rounded-xl border border-line bg-paper p-3">
          <dt class="eyebrow">Paradas</dt>
          <dd class="mt-1 font-mono text-xl font-bold tabular-nums text-ink">
            {{ driver.settledCount }}/{{ driver.totalCount }}
          </dd>
        </div>
        <div class="rounded-xl border border-success/30 bg-success/5 p-3">
          <dt class="eyebrow text-success-600">Entregados</dt>
          <dd class="mt-1 font-mono text-xl font-bold tabular-nums text-success-600">
            {{ driver.dayDelivered }}
          </dd>
        </div>
        <div class="rounded-xl border border-alert/25 bg-alert/5 p-3">
          <dt class="eyebrow text-alert-600">No entregados</dt>
          <dd class="mt-1 font-mono text-xl font-bold tabular-nums text-alert-600">
            {{ driver.dayFailed }}
          </dd>
        </div>
        <div class="rounded-xl border border-ember/40 bg-ember-50 p-3">
          <dt class="eyebrow text-ember-600">Recaudado</dt>
          <dd class="mt-1 font-mono text-xl font-bold tabular-nums text-ember-600">
            {{ formatCOP(driver.dayCash) }}
          </dd>
        </div>
      </dl>

      <!-- Settled stops of the current run -->
      <p class="mb-1.5 mt-5 eyebrow">Paradas cerradas</p>
      <ul
        v-if="driver.dayStops.length"
        class="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl border border-line bg-paper"
      >
        <li
          v-for="st in driver.dayStops"
          :key="st.id"
          class="flex items-center gap-3 px-3.5 py-2.5"
        >
          <span class="w-9 flex-none font-mono text-[11px] tabular-nums text-steel-400">
            {{ stampOf(st) }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-ink">{{ st.address_text }}</span>
            <span v-if="st.not_delivered_reason" class="block truncate text-[11px] text-alert-600">
              {{ st.not_delivered_reason }}
            </span>
            <span v-else class="block truncate text-[11px] text-muted">
              {{ st.customer_name ?? 'Cliente' }}
            </span>
          </span>
          <span class="flex flex-none flex-col items-end gap-1">
            <span
              class="font-mono text-[12px] tabular-nums"
              :class="st.paid === true ? 'text-steel-400' : 'text-ink'"
            >
              {{ st.paid === true ? 'Pagado' : formatCOP(st.total) }}
            </span>
            <StatusPill :status="st.delivery_status" />
          </span>
        </li>
      </ul>
      <p v-else class="mt-2 rounded-xl border border-line bg-paper px-4 py-6 text-center text-sm text-muted">
        Aún no has cerrado ninguna parada en este despacho.
      </p>
    </template>

    <!-- No active run: nothing to summarize (no cross-run history endpoint yet). -->
    <div
      v-else
      class="mt-8 flex flex-col items-center justify-center rounded-xl border border-line bg-paper px-6 py-12 text-center"
    >
      <span class="grid size-12 place-items-center rounded-full bg-sunken text-steel-400">
        <i class="pi pi-receipt text-xl" />
      </span>
      <p class="mt-3 text-sm font-semibold text-ink">Sin despacho activo</p>
      <p class="mt-1 max-w-[16rem] text-[13px] text-muted">
        Abre un despacho para ver aquí el resumen de tus entregas.
      </p>
    </div>
  </section>
</template>
