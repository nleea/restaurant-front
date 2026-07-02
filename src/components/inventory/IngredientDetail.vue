<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useInventoryStore } from '@/stores/inventory'
import { formatQuantity } from '@/lib/quantity'
import { statusOf } from '@/lib/apiError'
import type { StockRow } from '@/stores/inventory'
import type { MovementType } from '@/services/inventory.api'

// Detail pane for one stock row: on-hand vs reorder point, the three adjust actions (threshold,
// movement, recount — each gated by `inventory.adjust` and attributed to an employee), and the
// ingredient's movement history newest-first.
const props = defineProps<{
  row: StockRow
  employeeOptions: { label: string; value: string }[]
  canAdjust: boolean
}>()
const emit = defineEmits<{ back: [] }>()

const inv = useInventoryStore()

const REASONS = ['Recepción', 'Merma', 'Traslado', 'Corrección']
const TYPES: { label: string; value: MovementType }[] = [
  { label: 'Entrada', value: 'in' },
  { label: 'Salida', value: 'out' },
]

const ingredientId = computed(() => props.row.stock.ingredient_id)
const unit = computed(() => props.row.unitAbbr)

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function typeLabel(type: string): string {
  if (type === 'in') return 'Entrada'
  if (type === 'out') return 'Salida'
  return 'Ajuste'
}

// --- Threshold dialog ------------------------------------------------------
const showThreshold = ref(false)
const tValue = ref<number | null>(null)
const tSaving = ref(false)
const tError = ref<string | null>(null)

function openThreshold() {
  tValue.value = Number(props.row.stock.min_stock)
  tError.value = null
  showThreshold.value = true
}

const canSubmitThreshold = computed(() => tValue.value !== null && tValue.value >= 0)

async function submitThreshold() {
  if (!canSubmitThreshold.value || tValue.value === null) return
  tSaving.value = true
  tError.value = null
  try {
    await inv.setThreshold(ingredientId.value, String(tValue.value))
    showThreshold.value = false
  } catch {
    tError.value = 'No se pudo actualizar el mínimo.'
  } finally {
    tSaving.value = false
  }
}

// --- Movement dialog -------------------------------------------------------
const showMovement = ref(false)
const mType = ref<MovementType>('in')
const mQuantity = ref<number | null>(null)
const mReason = ref('')
const mNotes = ref('')
const mEmployee = ref<string | null>(null)
const mSaving = ref(false)
const mError = ref<string | null>(null)

function openMovement() {
  mType.value = 'in'
  mQuantity.value = null
  mReason.value = ''
  mNotes.value = ''
  mEmployee.value = null
  mError.value = null
  showMovement.value = true
}

const canSubmitMovement = computed(
  () =>
    mEmployee.value !== null &&
    mQuantity.value !== null &&
    mQuantity.value > 0 &&
    mReason.value.trim() !== '',
)

async function submitMovement() {
  if (!canSubmitMovement.value || mEmployee.value === null || mQuantity.value === null) return
  mSaving.value = true
  mError.value = null
  try {
    await inv.registerMovement({
      ingredient_id: ingredientId.value,
      employee_id: mEmployee.value,
      type: mType.value,
      quantity: String(mQuantity.value),
      reason: mReason.value.trim(),
      notes: mNotes.value.trim() || null,
    })
    showMovement.value = false
  } catch (e) {
    const status = statusOf(e)
    mError.value =
      status === 409
        ? 'No hay suficiente existencia para esa salida.'
        : status === 422
          ? 'Datos inválidos: revisa la cantidad (debe ser mayor a cero).'
          : 'No se pudo registrar el movimiento.'
  } finally {
    mSaving.value = false
  }
}

// --- Recount dialog --------------------------------------------------------
const showRecount = ref(false)
const rCounted = ref<number | null>(null)
const rNotes = ref('')
const rEmployee = ref<string | null>(null)
const rSaving = ref(false)
const rError = ref<string | null>(null)

function openRecount() {
  rCounted.value = null
  rNotes.value = ''
  rEmployee.value = null
  rError.value = null
  showRecount.value = true
}

const canSubmitRecount = computed(
  () => rEmployee.value !== null && rCounted.value !== null && rCounted.value >= 0,
)

async function submitRecount() {
  if (!canSubmitRecount.value || rEmployee.value === null || rCounted.value === null) return
  rSaving.value = true
  rError.value = null
  try {
    await inv.recount({
      ingredient_id: ingredientId.value,
      employee_id: rEmployee.value,
      counted_quantity: String(rCounted.value),
      notes: rNotes.value.trim() || null,
    })
    showRecount.value = false
  } catch {
    rError.value = 'No se pudo registrar el recuento.'
  } finally {
    rSaving.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-5">
    <button
      type="button"
      class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
      @click="emit('back')"
    >
      <i class="pi pi-angle-left" /> Volver
    </button>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="truncate text-lg font-semibold text-ink">{{ row.name }}</h2>
        <p v-if="row.low" class="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-alert">
          Bajo mínimo
        </p>
      </div>
    </div>

    <dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Existencia</dt>
        <dd class="font-mono text-base font-semibold" :class="row.low ? 'text-alert' : 'text-ink'">
          {{ formatQuantity(row.stock.current_quantity, unit) || '0' }}
        </dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Punto de reorden</dt>
        <dd class="font-mono text-ink">{{ formatQuantity(row.stock.min_stock, unit) || '0' }}</dd>
      </div>
    </dl>

    <!-- Adjust actions -->
    <div v-if="canAdjust" class="mt-4 flex flex-wrap gap-2">
      <Button label="Registrar movimiento" size="small" icon="pi pi-plus" @click="openMovement" />
      <Button label="Recuento físico" size="small" severity="contrast" icon="pi pi-calculator" @click="openRecount" />
      <Button label="Ajustar mínimo" size="small" severity="secondary" outlined icon="pi pi-sliders-h" @click="openThreshold" />
    </div>

    <!-- Movement history -->
    <h3 class="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Movimientos</h3>
    <p v-if="!inv.movements.length" class="mt-2 text-sm text-steel-500">
      Sin movimientos registrados para este ingrediente.
    </p>
    <ul v-else class="mt-2 divide-y divide-line rounded-lg border border-line bg-paper">
      <li v-for="m in inv.movements" :key="m.id" class="flex items-center justify-between gap-3 px-3 py-2">
        <span class="min-w-0">
          <span class="block truncate text-sm text-ink">{{ m.reason }}</span>
          <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
            {{ typeLabel(m.type) }} · {{ formatDateTime(m.created_at) }}
          </span>
        </span>
        <span
          class="shrink-0 font-mono text-sm"
          :class="m.type === 'in' ? 'text-emerald-600' : m.type === 'out' ? 'text-alert' : 'text-steel-500'"
        >
          {{ m.type === 'in' ? '+' : m.type === 'out' ? '−' : '' }}{{ formatQuantity(m.quantity, unit) }}
        </span>
      </li>
    </ul>

    <!-- Threshold dialog -->
    <Dialog v-model:visible="showThreshold" modal header="Ajustar mínimo" :style="{ width: '22rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="t-min" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Punto de reorden ({{ unit || 'unidad' }})
          </label>
          <InputNumber id="t-min" v-model="tValue" :min="0" :max-fraction-digits="3" fluid autofocus />
        </div>
        <p v-if="tError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ tError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showThreshold = false" />
        <Button label="Guardar" :loading="tSaving" :disabled="!canSubmitThreshold" @click="submitThreshold" />
      </template>
    </Dialog>

    <!-- Movement dialog -->
    <Dialog v-model:visible="showMovement" modal header="Registrar movimiento" :style="{ width: '26rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="m-type" class="text-xs font-medium uppercase tracking-wide text-steel-500">Tipo</label>
            <Select id="m-type" v-model="mType" :options="TYPES" option-label="label" option-value="value" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="m-qty" class="text-xs font-medium uppercase tracking-wide text-steel-500">
              Cantidad ({{ unit || 'unidad' }})
            </label>
            <InputNumber id="m-qty" v-model="mQuantity" :min="0" :max-fraction-digits="3" fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="m-reason" class="text-xs font-medium uppercase tracking-wide text-steel-500">Razón</label>
          <InputText id="m-reason" v-model="mReason" fluid maxlength="50" placeholder="Recepción, merma, traslado…" />
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="r in REASONS"
              :key="r"
              type="button"
              class="rounded-full border border-line bg-app px-2.5 py-0.5 font-mono text-[10px] text-steel-500 transition hover:border-ember/60 hover:text-ink"
              @click="mReason = r"
            >
              {{ r }}
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="m-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">Empleado</label>
          <Select id="m-emp" v-model="mEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Elige un empleado" fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="m-notes" class="text-xs font-medium uppercase tracking-wide text-steel-500">Notas (opcional)</label>
          <InputText id="m-notes" v-model="mNotes" fluid maxlength="255" />
        </div>
        <p v-if="mError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ mError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showMovement = false" />
        <Button label="Registrar" :loading="mSaving" :disabled="!canSubmitMovement" @click="submitMovement" />
      </template>
    </Dialog>

    <!-- Recount dialog -->
    <Dialog v-model:visible="showRecount" modal header="Recuento físico" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[11px] text-steel-500">
          Existencia actual:
          <span class="text-ink">{{ formatQuantity(row.stock.current_quantity, unit) || '0' }}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="r-counted" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Cantidad contada ({{ unit || 'unidad' }})
          </label>
          <InputNumber id="r-counted" v-model="rCounted" :min="0" :max-fraction-digits="3" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="r-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">Empleado</label>
          <Select id="r-emp" v-model="rEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Elige un empleado" fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="r-notes" class="text-xs font-medium uppercase tracking-wide text-steel-500">Notas (opcional)</label>
          <InputText id="r-notes" v-model="rNotes" fluid maxlength="255" />
        </div>
        <p v-if="rError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ rError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showRecount = false" />
        <Button label="Registrar recuento" severity="contrast" :loading="rSaving" :disabled="!canSubmitRecount" @click="submitRecount" />
      </template>
    </Dialog>
  </div>
</template>
