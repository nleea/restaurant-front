<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useCashStore } from '@/stores/cash'
import { formatCOP } from '@/lib/money'
import { conceptLabel } from '@/lib/cashConcepts'
import { statusOf } from '@/lib/apiError'
import type { MovementType } from '@/services/cash.api'

// The active drawer: the open session's float, the live cash-only expected figure, the movement
// ledger, plus the registrar-movimiento and cerrar-caja (arqueo) actions. Gated per-action by the
// parent (`cash.move` / `cash.close`).
defineProps<{
  employeeOptions: { label: string; value: string }[]
  canMove: boolean
  canClose: boolean
}>()

const cash = useCashStore()

// Known payment methods; only `cash` drives the drawer reconciliation, the rest are recorded.
const METHODS = [
  { label: 'Efectivo', value: 'cash' },
  { label: 'Tarjeta', value: 'card' },
  { label: 'Nequi', value: 'nequi' },
  { label: 'Daviplata', value: 'daviplata' },
]
const TYPES: { label: string; value: MovementType }[] = [
  { label: 'Entrada', value: 'in' },
  { label: 'Salida', value: 'out' },
]

function methodLabel(method: string): string {
  return METHODS.find((m) => m.value === method)?.label ?? 'Otro'
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

// --- Registrar movimiento dialog -------------------------------------------
const showMovement = ref(false)
const mType = ref<MovementType>('in')
const mConcept = ref('')
const mAmount = ref<number | null>(null)
const mMethod = ref('cash')
const movSaving = ref(false)
const movError = ref<string | null>(null)

function openMovement() {
  mType.value = 'in'
  mConcept.value = ''
  mAmount.value = null
  mMethod.value = 'cash'
  movError.value = null
  showMovement.value = true
}

const canSubmitMovement = computed(
  () => mConcept.value.trim() !== '' && mAmount.value !== null && mAmount.value > 0,
)

async function submitMovement() {
  if (!canSubmitMovement.value || mAmount.value === null) return
  movSaving.value = true
  movError.value = null
  try {
    await cash.registerMovement({
      type: mType.value,
      concept: mConcept.value.trim(),
      amount: mAmount.value.toFixed(2),
      method: mMethod.value,
    })
    showMovement.value = false
  } catch (e) {
    const status = statusOf(e)
    movError.value =
      status === 409
        ? 'La caja ya no está abierta.'
        : status === 422
          ? 'Datos inválidos: revisa el monto (debe ser mayor a cero).'
          : 'No se pudo registrar el movimiento.'
  } finally {
    movSaving.value = false
  }
}

// --- Cerrar caja (arqueo) dialog -------------------------------------------
const showClose = ref(false)
const cEmployee = ref<string | null>(null)
const cCounted = ref<number | null>(null)
const closeSaving = ref(false)
const closeError = ref<string | null>(null)

function openClose() {
  cEmployee.value = null
  cCounted.value = null
  closeError.value = null
  showClose.value = true
}

const canSubmitClose = computed(
  () => cEmployee.value !== null && cCounted.value !== null && cCounted.value >= 0,
)

async function submitClose() {
  if (!canSubmitClose.value || cEmployee.value === null || cCounted.value === null) return
  closeSaving.value = true
  closeError.value = null
  try {
    await cash.closeSession({
      closed_by_employee_id: cEmployee.value,
      counted_amount: cCounted.value.toFixed(2),
    })
    showClose.value = false
  } catch (e) {
    const status = statusOf(e)
    closeError.value =
      status === 409
        ? 'La caja ya estaba cerrada.'
        : status === 422
          ? 'Monto contado inválido.'
          : 'No se pudo cerrar la caja.'
  } finally {
    closeSaving.value = false
  }
}
</script>

<template>
  <section v-if="cash.currentSession" class="flex flex-col gap-4">
    <!-- Header: drawer state + the live cash-only expected figure -->
    <div class="rounded-xl border border-line bg-paper p-4 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <i class="pi pi-wallet text-sm" />
            </span>
            <div>
              <h2 class="text-sm font-semibold text-ink">Caja abierta</h2>
              <p class="font-mono text-[11px] text-steel-500">
                Apertura: {{ formatDateTime(cash.currentSession.opened_at) }}
              </p>
            </div>
          </div>
          <dl class="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Fondo</dt>
              <dd class="font-mono text-ink">{{ formatCOP(cash.currentSession.opening_amount) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Pre-close guidance: the drawer cash we'll count against, computed cash-only. -->
        <div class="rounded-lg border border-line bg-app px-4 py-3 text-right">
          <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
            Efectivo esperado (estimado)
          </p>
          <p class="font-mono text-xl font-extrabold text-ink">
            {{ formatCOP(cash.runningExpectedCash) }}
          </p>
          <p class="mt-0.5 font-mono text-[10px] text-steel-500">solo efectivo</p>
        </div>
      </div>

      <!-- Per-method summary so cash vs other is legible at a glance. -->
      <div v-if="cash.movementsByMethod.length" class="mt-4 flex flex-wrap gap-2">
        <span
          v-for="row in cash.movementsByMethod"
          :key="row.method"
          class="rounded-lg border px-2.5 py-1 font-mono text-[11px]"
          :class="row.method === 'cash' ? 'border-ember/40 bg-ember/5 text-ink' : 'border-line bg-app text-steel-500'"
        >
          {{ methodLabel(row.method) }}:
          <span class="text-emerald-600">+{{ formatCOP(row.inTotal) }}</span>
          <span v-if="row.outTotal !== '0.00'" class="text-alert"> −{{ formatCOP(row.outTotal) }}</span>
        </span>
      </div>

      <!-- Actions -->
      <div class="mt-4 flex flex-wrap gap-2">
        <Button
          v-if="canMove"
          label="Registrar movimiento"
          size="small"
          icon="pi pi-plus"
          @click="openMovement"
        />
        <Button
          v-if="canClose"
          label="Cerrar caja (arqueo)"
          size="small"
          severity="contrast"
          icon="pi pi-lock"
          @click="openClose"
        />
      </div>
    </div>

    <!-- Movement ledger -->
    <div class="rounded-xl border border-line bg-paper">
      <h3 class="border-b border-line px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">
        Movimientos del turno
      </h3>
      <p v-if="!cash.currentMovements.length" class="px-4 py-6 text-center text-sm text-steel-500">
        Aún no hay movimientos en este turno.
      </p>
      <ul v-else class="divide-y divide-line">
        <li
          v-for="m in cash.currentMovements"
          :key="m.id"
          class="flex items-center justify-between gap-3 px-4 py-3"
        >
          <span class="flex min-w-0 items-center gap-3">
            <span
              class="grid size-7 shrink-0 place-items-center rounded-full"
              :class="m.type === 'in' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-alert/10 text-alert'"
            >
              <i :class="['pi', m.type === 'in' ? 'pi-arrow-down-left' : 'pi-arrow-up-right', 'text-xs']" />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm text-ink">{{ conceptLabel(m.concept) }}</span>
              <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
                {{ methodLabel(m.method) }}
              </span>
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

    <!-- Registrar movimiento dialog -->
    <Dialog
      v-model:visible="showMovement"
      modal
      header="Registrar movimiento"
      :style="{ width: '26rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="m-type" class="text-xs font-medium uppercase tracking-wide text-steel-500">Tipo</label>
            <Select id="m-type" v-model="mType" :options="TYPES" option-label="label" option-value="value" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="m-method" class="text-xs font-medium uppercase tracking-wide text-steel-500">Método</label>
            <Select id="m-method" v-model="mMethod" :options="METHODS" option-label="label" option-value="value" fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="m-concept" class="text-xs font-medium uppercase tracking-wide text-steel-500">Concepto</label>
          <InputText id="m-concept" v-model="mConcept" fluid autofocus maxlength="50" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="m-amount" class="text-xs font-medium uppercase tracking-wide text-steel-500">Monto</label>
          <InputNumber
            id="m-amount"
            v-model="mAmount"
            :min="0"
            mode="currency"
            currency="COP"
            locale="es-CO"
            :max-fraction-digits="0"
            fluid
          />
        </div>
        <p
          v-if="mMethod !== 'cash'"
          class="font-mono text-[11px] text-steel-500"
        >
          Los movimientos que no son en efectivo se registran pero no afectan el efectivo esperado.
        </p>
        <p
          v-if="movError"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ movError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showMovement = false" />
        <Button label="Registrar" :loading="movSaving" :disabled="!canSubmitMovement" @click="submitMovement" />
      </template>
    </Dialog>

    <!-- Cerrar caja (arqueo) dialog -->
    <Dialog
      v-model:visible="showClose"
      modal
      header="Cerrar caja (arqueo)"
      :style="{ width: '26rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[11px] text-steel-500">
          Efectivo esperado (estimado):
          <span class="text-ink">{{ formatCOP(cash.runningExpectedCash) }}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="c-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Empleado que cierra
          </label>
          <Select
            id="c-emp"
            v-model="cEmployee"
            :options="employeeOptions"
            option-label="label"
            option-value="value"
            placeholder="Elige un empleado"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="c-counted" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Efectivo contado
          </label>
          <InputNumber
            id="c-counted"
            v-model="cCounted"
            :min="0"
            mode="currency"
            currency="COP"
            locale="es-CO"
            :max-fraction-digits="0"
            fluid
          />
        </div>
        <p
          v-if="closeError"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ closeError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showClose = false" />
        <Button label="Cerrar caja" severity="contrast" :loading="closeSaving" :disabled="!canSubmitClose" @click="submitClose" />
      </template>
    </Dialog>
  </section>
</template>
