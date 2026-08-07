<script setup lang="ts">
// State A · Historial de cajas — the master–detail reference pattern (RBAC /
// inventory): on < lg the list fills and a row drills into a full-screen arqueo
// with a back affordance; on >= lg both panes show and selection updates the
// arqueo docket in place. One `selected` ref, no sub-routes.
import { computed, ref, watch } from 'vue'
import {
  history,
  getSessionBreakdown,
  humanDuration,
  longDate,
  shortTime,
  type HistoryCaja,
  type RankedBar,
} from '@/lib/cashStation'
import { cop, copSigned } from '@/lib/cop'

const employeeFilter = ref<string>('all')
const page = ref(1)
const PER_PAGE = 8

// Cashier options for the filter are the distinct names present in the real history.
const cashierNames = computed(() => [...new Set(history.value.map((h) => h.cashier))].sort())

const filtered = computed(() =>
  employeeFilter.value === 'all'
    ? history.value
    : history.value.filter((h) => h.cashier === employeeFilter.value),
)
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))

const selected = ref<HistoryCaja | null>(null)
// Keep a sensible default selection as the (async) history arrives.
watch(
  () => history.value,
  (list) => {
    if (!selected.value && list.length) selected.value = list[0] ?? null
  },
  { immediate: true },
)

// Per-session breakdown (sales total + method bars), fetched when a row is selected.
const breakdownSales = ref<number | null>(null)
const breakdownMethods = ref<RankedBar[]>([])
watch(
  selected,
  async (h) => {
    breakdownSales.value = null
    breakdownMethods.value = []
    if (!h) return
    try {
      const b = await getSessionBreakdown(h.id)
      breakdownSales.value = b.salesTotal
      breakdownMethods.value = b.methods
    } catch {
      breakdownSales.value = null
      breakdownMethods.value = []
    }
  },
  { immediate: true },
)

function select(h: HistoryCaja) {
  selected.value = h
}
function setEmployee(v: string) {
  employeeFilter.value = v
  page.value = 1
}

function cuadreOf(diff: number): 'ok' | 'warn' | 'hot' {
  const a = Math.abs(diff)
  return a === 0 ? 'ok' : a < 10_000 ? 'warn' : 'hot'
}
const cuadreText = { ok: 'Cuadra perfectamente', warn: 'Diferencia menor', hot: 'Revisar arqueo' }
const cuadreColor = { ok: 'text-success-600', warn: 'text-ember-600', hot: 'text-alert-600' }

// Arqueo view for a closed caja — the REAL closed-session fields.
const detail = computed(() => {
  const h = selected.value
  if (!h) return null
  const duration = humanDuration(new Date(h.closedAt).getTime() - new Date(h.openedAt).getTime())
  return { h, duration, cuadre: cuadreOf(h.difference) }
})
</script>

<template>
  <section class="flex flex-col gap-3">
    <!-- Header row: label + count + employee filter -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-steel-600">
        Historial de cajas
      </h2>
      <span class="rounded-full bg-sunken px-2 py-0.5 font-mono text-[11px] tabular-nums text-steel-500">
        {{ filtered.length }}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <select
          :value="employeeFilter"
          class="rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-ember/60"
          @change="setEmployee(($event.target as HTMLSelectElement).value)"
        >
          <option value="all">Todos los empleados</option>
          <option v-for="c in cashierNames" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
      <!-- LEFT · list -->
      <div class="flex flex-col gap-2" :class="{ 'max-lg:hidden': selected }">
        <button
          v-for="h in shown"
          :key="h.id"
          type="button"
          class="rounded-xl border bg-paper px-4 py-3 text-left transition"
          :class="selected?.id === h.id ? 'border-ember/50 bg-ember-50/40 ring-1 ring-ember/20' : 'border-line hover:border-ember/30 hover:shadow-sm'"
          @click="select(h)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-2 font-mono text-[12px] text-steel-600">
              <i class="pi pi-calendar text-[11px] text-steel-400" />{{ longDate(h.closedAt) }}, {{ shortTime(h.closedAt) }}
            </span>
            <span class="pill pill-neutral">Cerrada</span>
          </div>
          <p class="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink">
            <span class="grid size-5 place-items-center rounded-full bg-sunken font-mono text-[9px] font-bold text-steel-600">
              {{ h.cashier.split(' ').map((w) => w[0]).slice(0, 2).join('') }}
            </span>
            {{ h.cashier }}
          </p>
          <div class="mt-1.5 flex items-center justify-between font-mono text-[11px] text-steel-500">
            <span>Fondo {{ cop(h.float) }} · Esperado {{ cop(h.expected) }}</span>
            <span
              v-if="h.difference !== 0"
              class="tabular-nums"
              :class="cuadreColor[cuadreOf(h.difference)]"
            >{{ copSigned(h.difference) }}</span>
            <span v-else class="text-success-600"><i class="pi pi-check text-[10px]" /></span>
          </div>
        </button>

        <!-- Pagination -->
        <div v-if="pageCount > 1" class="mt-1 flex items-center justify-between font-mono text-[11px] text-steel-500">
          <button type="button" :disabled="page === 1" class="rounded-lg px-2 py-1 transition hover:bg-sunken disabled:opacity-30" @click="page -= 1">← Anterior</button>
          <span class="tabular-nums">
            {{ (page - 1) * PER_PAGE + 1 }}–{{ Math.min(page * PER_PAGE, filtered.length) }} de {{ filtered.length }}
          </span>
          <button type="button" :disabled="page === pageCount" class="rounded-lg px-2 py-1 transition hover:bg-sunken disabled:opacity-30" @click="page += 1">Siguiente →</button>
        </div>
      </div>

      <!-- RIGHT · arqueo detail -->
      <div class="lg:min-w-0" :class="{ 'max-lg:hidden': !selected }">
        <div v-if="detail" class="card detail-enter-active overflow-hidden">
          <div class="docket-perf h-[7px] w-full" />
          <div class="flex flex-col gap-4 p-5">
            <header class="flex items-start justify-between gap-3">
              <div>
                <p class="eyebrow">Arqueo — {{ longDate(detail.h.closedAt) }}</p>
                <p class="mt-1 font-mono text-[11px] text-steel-500">
                  {{ detail.h.cashier }} · {{ detail.duration }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg px-2 py-1 font-mono text-[11px] text-steel-500 transition hover:bg-sunken lg:hidden"
                @click="selected = null"
              >
                ← Volver
              </button>
            </header>

            <dl class="flex flex-col gap-1.5 rounded-xl border border-line bg-sunken/30 p-4 font-mono text-[12px]">
              <div class="flex justify-between"><dt class="text-steel-500">Fondo apertura</dt><dd class="tabular-nums text-ink">{{ cop(detail.h.float) }}</dd></div>
              <div v-if="breakdownSales !== null" class="flex justify-between"><dt class="text-steel-500">Total ventas</dt><dd class="tabular-nums text-success-600">+{{ cop(breakdownSales) }}</dd></div>
              <div class="mt-1 flex justify-between border-t border-dashed border-line pt-2"><dt class="text-steel-500">Efectivo esperado</dt><dd class="tabular-nums font-semibold text-ink">{{ cop(detail.h.expected) }}</dd></div>
              <div class="flex justify-between"><dt class="text-steel-500">Efectivo contado</dt><dd class="tabular-nums text-ink">{{ cop(detail.h.counted) }}</dd></div>
              <div class="mt-1 flex items-center justify-between border-t border-dashed border-line pt-2">
                <dt class="text-steel-500">Diferencia</dt>
                <dd class="flex items-center gap-1.5 font-bold tabular-nums" :class="cuadreColor[detail.cuadre]">
                  <i :class="['pi', detail.cuadre === 'ok' ? 'pi-check-circle' : 'pi-exclamation-triangle', 'text-[11px]']" />
                  {{ copSigned(detail.h.difference) }}
                </dd>
              </div>
            </dl>
            <p class="-mt-2 text-right font-mono text-[11px]" :class="cuadreColor[detail.cuadre]">{{ cuadreText[detail.cuadre] }}</p>

            <section v-if="breakdownMethods.length">
              <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Ventas por método de pago</p>
              <div class="flex flex-col gap-1.5">
                <div v-for="(m, i) in breakdownMethods" :key="m.key" class="flex flex-col gap-1">
                  <div class="flex justify-between text-[12px]"><span class="text-ink">{{ m.label }}</span><span class="font-mono tabular-nums text-steel-600">{{ cop(m.value) }} · {{ Math.round(m.pct) }}%</span></div>
                  <div class="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div class="h-full rounded-full" :style="{ width: m.pct + '%', backgroundColor: `color-mix(in oklab, var(--color-ember) ${70 - i * 15}%, var(--color-steel-500))` }" />
                  </div>
                </div>
              </div>
            </section>

            <div class="flex flex-wrap gap-2 border-t border-line pt-3">
              <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-steel-600 transition hover:bg-sunken"><i class="pi pi-print text-[11px]" /> Imprimir arqueo</button>
              <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-steel-600 transition hover:bg-sunken"><i class="pi pi-download text-[11px]" /> Exportar PDF</button>
            </div>
          </div>
        </div>
        <div v-else class="grid h-full min-h-40 place-items-center rounded-xl border border-dashed border-line font-mono text-[12px] text-steel-400">
          Selecciona una caja para ver su arqueo.
        </div>
      </div>
    </div>
  </section>
</template>
