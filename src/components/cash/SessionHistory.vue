<script setup lang="ts">
import { computed } from 'vue'
import { useCashStore } from '@/stores/cash'
import { formatCOP } from '@/lib/money'
import { conceptLabel } from '@/lib/cashConcepts'
import type { CashSession } from '@/services/cash.api'

// History master–detail: the branch's sessions on the left, the selected session's reconciliation
// (opening / expected / counted / difference) and movement ledger on the right. Read-only.
const cash = useCashStore()

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
  }
  return map[method] ?? 'Otro'
}

// difference = counted − expected. Positive is a surplus (sobrante), negative a shortfall (faltante).
function diffView(session: CashSession): { text: string; tone: string } | null {
  if (session.difference === null) return null
  const n = Number(session.difference)
  if (n === 0) return { text: 'Sin diferencia', tone: 'text-steel-500' }
  if (n > 0) return { text: `Sobrante ${formatCOP(session.difference)}`, tone: 'text-emerald-600' }
  return { text: `Faltante ${formatCOP(String(Math.abs(n)))}`, tone: 'text-alert' }
}

const detailDiff = computed(() =>
  cash.selectedSession ? diffView(cash.selectedSession) : null,
)

function select(id: string) {
  void cash.selectSession(id)
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <h2 class="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Historial de cajas</h2>

    <p v-if="!cash.history.length" class="mt-4 text-sm text-steel-500">
      Aún no hay cajas registradas en esta sucursal.
    </p>

    <div v-else class="mt-4 lg:grid lg:grid-cols-[18rem_1fr] lg:gap-6">
      <!-- LIST (drill-down master) -->
      <ul class="flex flex-col gap-1.5" :class="cash.selectedSessionId ? 'max-lg:hidden' : ''">
        <li v-for="s in cash.history" :key="s.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="cash.selectedSessionId === s.id ? 'border-ember ring-1 ring-ember/30' : ''"
            @click="select(s.id)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-ink">{{ formatDate(s.opened_at) }}</span>
              <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
                Fondo {{ formatCOP(s.opening_amount) }}
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <span
                class="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide"
                :class="s.status === 'open' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-steel-500/10 text-steel-500'"
              >
                {{ s.status === 'open' ? 'Abierta' : 'Cerrada' }}
              </span>
              <span class="text-steel-500 lg:hidden" aria-hidden="true">
                <i class="pi pi-angle-right" />
              </span>
            </span>
          </button>
        </li>
      </ul>

      <!-- DETAIL -->
      <div
        class="rounded-xl border border-line bg-app"
        :class="cash.selectedSessionId ? 'max-lg:mt-4' : 'max-lg:hidden'"
      >
        <div v-if="!cash.selectedSession" class="grid h-40 place-items-center px-6 text-center text-steel-500">
          Elige una caja para ver su arqueo.
        </div>

        <div v-else class="p-4 sm:p-5">
          <button
            type="button"
            class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
            @click="cash.selectedSessionId = null"
          >
            <i class="pi pi-angle-left" /> Volver
          </button>

          <p class="font-mono text-[11px] text-steel-500">
            Abierta {{ formatDate(cash.selectedSession.opened_at) }}
            <template v-if="cash.selectedSession.closed_at">
              · Cerrada {{ formatDate(cash.selectedSession.closed_at) }}
            </template>
          </p>

          <dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Fondo de apertura</dt>
              <dd class="font-mono text-ink">{{ formatCOP(cash.selectedSession.opening_amount) }}</dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Efectivo esperado</dt>
              <dd class="font-mono text-ink">{{ formatCOP(cash.selectedSession.expected_amount) || '—' }}</dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Efectivo contado</dt>
              <dd class="font-mono text-ink">{{ formatCOP(cash.selectedSession.counted_amount) || '—' }}</dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Diferencia</dt>
              <dd v-if="detailDiff" class="font-mono font-semibold" :class="detailDiff.tone">
                {{ detailDiff.text }}
              </dd>
              <dd v-else class="font-mono text-steel-500">—</dd>
            </div>
          </dl>

          <!-- Session movements -->
          <h3 class="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Movimientos</h3>
          <p v-if="!cash.selectedMovements.length" class="mt-2 text-sm text-steel-500">
            Sin movimientos en este turno.
          </p>
          <ul v-else class="mt-2 divide-y divide-line rounded-lg border border-line bg-paper">
            <li
              v-for="m in cash.selectedMovements"
              :key="m.id"
              class="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm text-ink">{{ conceptLabel(m.concept) }}</span>
                <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ methodLabel(m.method) }}
                </span>
              </span>
              <span
                class="shrink-0 font-mono text-sm"
                :class="m.type === 'in' ? 'text-emerald-600' : 'text-alert'"
              >
                {{ m.type === 'in' ? '+' : '−' }}{{ formatCOP(m.amount) }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
