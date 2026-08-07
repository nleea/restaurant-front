<script setup lang="ts">
// Cierre de caja — the three-beat arqueo (contar · reportar · confirmar).
//
// SIGNATURE: the heat lamp, repurposed. El Pase's lamp glow normally marks an
// overdue docket; here it marks a cash discrepancy. As the cajera counts
// denominations, the DIFERENCIA panel is the docket under the lamp: a perfect
// cuadre sits calm (success ring), a small gap glows warm ember, a big gap
// breathes red (`heat-hot`). The count-up figure and the lamp are driven by the
// same live total — the arqueo literally runs hot when it doesn't add up.
import { computed, reactive, ref } from 'vue'
import StationModal from './StationModal.vue'
import MoneyTicker from './MoneyTicker.vue'
import {
  cash,
  summary,
  closeCaja,
  employeeOptions,
  shortTime,
  humanDuration,
  DENOMS,
  type HistoryCaja,
} from '@/lib/cashStation'
import { cop, copSigned } from '@/lib/cop'
import { statusOf } from '@/lib/apiError'

const emit = defineEmits<{ close: []; done: [HistoryCaja] }>()

const step = ref(1)
// Keyed by a unique row id, not by face value: $1.000 exists as both a bill and
// a coin, so keying by value would fuse the two rows and double-count.
const counts = reactive<Record<string, number | null>>({})
const notes = ref('')
const incident = ref(false)
const incidentNote = ref('')
const closedBy = ref<string | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)

const denomList = computed(() => [
  ...DENOMS.bills.map((v) => ({ v, id: `b${v}`, kind: 'bill' as const })),
  ...DENOMS.coins.map((v) => ({ v, id: `c${v}`, kind: 'coin' as const })),
])

const counted = computed(() =>
  denomList.value.reduce((s, d) => s + d.v * (counts[d.id] ?? 0), 0),
)
const expected = computed(() => summary.expectedCash.value)
const difference = computed(() => counted.value - expected.value)
const absDiff = computed(() => Math.abs(difference.value))

// The heat state of the cuadre — the load-bearing signal of the whole screen.
const cuadre = computed<'ok' | 'warn' | 'hot'>(() =>
  absDiff.value === 0 ? 'ok' : absDiff.value < 10_000 ? 'warn' : 'hot',
)
const cuadreCopy = computed(
  () =>
    ({
      ok: 'Cuadra perfectamente',
      warn: 'Diferencia menor',
      hot: 'Revisar arqueo',
    })[cuadre.value],
)

const elapsed = computed(() => humanDuration(summary.elapsedMs.value))

const canConfirm = computed(() => closedBy.value !== null)

async function confirm() {
  if (!closedBy.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    const closed = await closeCaja(
      counted.value,
      { notes: notes.value, incident: incident.value, incidentNote: incidentNote.value },
      closedBy.value,
    )
    emit('done', closed)
  } catch (e) {
    const status = statusOf(e)
    error.value =
      status === 409
        ? 'La caja ya estaba cerrada.'
        : status === 422
          ? 'Monto contado inválido.'
          : 'No se pudo cerrar la caja.'
  } finally {
    saving.value = false
  }
}

const fieldLabel = 'mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500'
const control =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20'
</script>

<template>
  <StationModal eyebrow="Estación · Cierre de caja" title="Cierre de caja" wide @close="emit('close')">
    <!-- Shift line + step tracker (a real 3-beat sequence, so numbering is honest) -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <p class="font-mono text-[12px] text-steel-600">
        {{ cash.cashier.name }} · {{ shortTime(cash.openedAt) }}–ahora
        <span class="text-steel-400">({{ elapsed }})</span>
      </p>
      <ol class="flex items-center gap-1 font-mono text-[11px]">
        <li
          v-for="(name, i) in ['Arqueo', 'Reporte', 'Confirmar']"
          :key="name"
          class="flex items-center gap-1"
        >
          <span
            class="grid size-5 place-items-center rounded-full text-[10px] font-bold transition"
            :class="step > i + 1 ? 'bg-success text-white' : step === i + 1 ? 'bg-ember text-white' : 'bg-sunken text-steel-500'"
          >
            <i v-if="step > i + 1" class="pi pi-check text-[9px]" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span :class="step === i + 1 ? 'text-ink' : 'text-steel-400'">{{ name }}</span>
          <span v-if="i < 2" class="mx-1 h-px w-4 bg-line" />
        </li>
      </ol>
    </div>

    <!-- ── STEP 1 · Arqueo ─────────────────────────────────────────────── -->
    <div v-if="step === 1" class="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div>
        <p class="mb-3 text-sm text-steel-600">Cuenta el efectivo en caja y regístralo por denominación.</p>
        <div class="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <div
            v-for="d in denomList"
            :key="d.id"
            class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sunken/60"
          >
            <span class="w-16 shrink-0 font-mono text-[12px] text-steel-600">{{ cop(d.v) }}</span>
            <span class="text-steel-300">×</span>
            <input
              v-model.number="counts[d.id]"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="0"
              class="w-14 rounded-md border border-line bg-surface px-2 py-1 text-center font-mono text-[13px] text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20"
            />
            <span class="ml-auto font-mono text-[12px] tabular-nums text-ink">{{ cop(d.v * (counts[d.id] ?? 0)) }}</span>
          </div>
        </div>
      </div>

      <!-- The cuadre docket — the number under the lamp -->
      <aside
        class="flex flex-col gap-3 self-start rounded-xl border p-4 transition"
        :class="{
          'border-success/40': cuadre === 'ok',
          'border-ember/40 heat-warm': cuadre === 'warn',
          'border-alert/50 heat-hot': cuadre === 'hot',
        }"
      >
        <div class="flex items-center justify-between font-mono text-[12px]">
          <span class="text-steel-500">Total contado</span>
          <MoneyTicker :value="counted" :format="cop" class="font-semibold text-ink" />
        </div>
        <div class="flex items-center justify-between font-mono text-[12px]">
          <span class="text-steel-500">Efectivo esperado</span>
          <span class="tabular-nums text-steel-600">{{ cop(expected) }}</span>
        </div>
        <div class="border-t border-dashed border-line pt-3">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wide text-steel-500">Diferencia</span>
            <MoneyTicker
              :value="difference"
              :format="copSigned"
              class="font-mono text-xl font-bold"
              :class="{ 'text-success-600': cuadre === 'ok', 'text-ember-600': cuadre === 'warn', 'text-alert-600': cuadre === 'hot' }"
            />
          </div>
          <p
            class="mt-1.5 flex items-center gap-1.5 font-mono text-[11px]"
            :class="{ 'text-success-600': cuadre === 'ok', 'text-ember-600': cuadre === 'warn', 'text-alert-600': cuadre === 'hot' }"
          >
            <i :class="['pi', cuadre === 'ok' ? 'pi-check-circle' : 'pi-exclamation-triangle', 'text-[11px]']" />
            {{ cuadreCopy }}
          </p>
        </div>
      </aside>
    </div>

    <!-- ── STEP 2 · Reporte ────────────────────────────────────────────── -->
    <div v-else-if="step === 2" class="flex flex-col gap-4">
      <div>
        <label :class="fieldLabel">Empleado que cierra</label>
        <select v-model="closedBy" :class="control">
          <option :value="null" disabled>Elige un empleado</option>
          <option v-for="o in employeeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div>
        <label :class="fieldLabel">¿Algo que reportar en este cierre?</label>
        <textarea
          v-model="notes"
          rows="4"
          class="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20"
          placeholder="Observaciones del cierre de caja…"
        />
      </div>
      <label class="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
        <span class="text-sm text-ink">¿Incidente en caja?</span>
        <button
          type="button"
          role="switch"
          :aria-checked="incident"
          class="relative h-6 w-11 rounded-full transition"
          :class="incident ? 'bg-alert' : 'bg-steel-300'"
          @click="incident = !incident"
        >
          <span
            class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
            :class="incident ? 'left-[22px]' : 'left-0.5'"
          />
        </button>
      </label>
      <textarea
        v-if="incident"
        v-model="incidentNote"
        rows="3"
        class="w-full rounded-xl border border-alert/30 bg-alert/5 px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-alert/20"
        placeholder="Describe el incidente…"
      />
    </div>

    <!-- ── STEP 3 · Confirmar ──────────────────────────────────────────── -->
    <div v-else class="flex flex-col gap-4">
      <dl class="divide-y divide-line rounded-xl border border-line bg-sunken/40 font-mono text-[13px]">
        <div v-for="row in [
            { k: 'Cajera', v: cash.cashier.name },
            { k: 'Turno', v: `${shortTime(cash.openedAt)}–ahora (${elapsed})` },
            { k: 'Ventas totales', v: cop(cash.salesTotal) },
            { k: 'Efectivo esperado', v: cop(expected) },
            { k: 'Efectivo contado', v: cop(counted) },
          ]" :key="row.k" class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-steel-500">{{ row.k }}</dt>
          <dd class="tabular-nums text-ink">{{ row.v }}</dd>
        </div>
        <div
          class="flex items-center justify-between px-4 py-3"
          :class="{ 'bg-success/8': cuadre === 'ok', 'bg-ember-50': cuadre === 'warn', 'bg-alert/8': cuadre === 'hot' }"
        >
          <dt class="font-sans text-[11px] uppercase tracking-wide text-steel-500">Diferencia</dt>
          <dd
            class="font-bold tabular-nums"
            :class="{ 'text-success-600': cuadre === 'ok', 'text-ember-600': cuadre === 'warn', 'text-alert-600': cuadre === 'hot' }"
          >
            {{ copSigned(difference) }} · {{ cuadreCopy }}
          </dd>
        </div>
      </dl>
      <p class="rounded-lg border border-alert/25 bg-alert/5 px-3.5 py-2.5 text-[12px] text-alert-600">
        Esta acción cerrará la caja definitivamente. No podrás registrar más movimientos una vez cerrada.
      </p>
      <p
        v-if="error"
        role="alert"
        class="rounded-lg border border-alert/30 bg-alert/5 px-3.5 py-2.5 font-mono text-[11px] text-alert-600"
      >
        {{ error }}
      </p>
    </div>

    <!-- Footer nav -->
    <div class="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
      <button
        type="button"
        class="rounded-xl px-4 py-2.5 text-sm font-medium text-steel-600 transition hover:bg-sunken"
        @click="step === 1 ? emit('close') : (step -= 1)"
      >
        {{ step === 1 ? 'Cancelar' : '← Atrás' }}
      </button>
      <button
        v-if="step < 3"
        type="button"
        class="rounded-xl bg-graphite-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-graphite-800"
        @click="step += 1"
      >
        Continuar →
      </button>
      <button
        v-else
        type="button"
        :disabled="!canConfirm || saving"
        class="flex items-center gap-2 rounded-xl bg-alert px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-alert-600 disabled:cursor-not-allowed disabled:opacity-40"
        @click="confirm"
      >
        <i :class="['pi text-xs', saving ? 'pi-spin pi-spinner' : 'pi-lock']" /> Cerrar caja definitivamente
      </button>
    </div>
  </StationModal>
</template>
