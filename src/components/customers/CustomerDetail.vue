<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useCustomersStore } from '@/stores/customers'
import { formatCOP } from '@/lib/money'
import { statusOf } from '@/lib/apiError'
import type { Credit, Customer } from '@/services/customers.api'

// Detail pane for one customer: identity (read-only — the backend update can't change name/contact)
// with deactivate/reactivate, free-form preferences, and fiado credits with settlement payments.
// All mutations gated by `customers.manage` from the parent.
const props = defineProps<{
  customer: Customer
  employeeOptions: { label: string; value: string }[]
  canManage: boolean
}>()
const emit = defineEmits<{ back: [] }>()

const customers = useCustomersStore()

const PAY_STATUS: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagada' }
const METHODS = [
  { label: 'Efectivo', value: 'cash' },
  { label: 'Transferencia', value: 'transfer' },
  { label: 'Tarjeta', value: 'card' },
  { label: 'Nequi', value: 'nequi' },
]

const fullName = computed(() => `${props.customer.first_name ?? ''} ${props.customer.last_name ?? ''}`.trim() || '—')

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'medium' })
}

// --- Deactivate / reactivate ----------------------------------------------
const toggling = ref(false)
async function toggleActive() {
  toggling.value = true
  try {
    if (props.customer.is_active) await customers.deactivateCustomer(props.customer.id)
    else await customers.updateCustomer(props.customer.id, { is_active: true })
  } finally {
    toggling.value = false
  }
}

// --- Preferences -----------------------------------------------------------
const showPref = ref(false)
const pKey = ref('')
const pValue = ref('')
const prefSaving = ref(false)
const prefError = ref<string | null>(null)

function openPref() {
  pKey.value = ''
  pValue.value = ''
  prefError.value = null
  showPref.value = true
}
const canSubmitPref = computed(() => pKey.value.trim() !== '' && pValue.value.trim() !== '')
async function submitPref() {
  if (!canSubmitPref.value) return
  prefSaving.value = true
  prefError.value = null
  try {
    await customers.setPreference(props.customer.id, pKey.value.trim(), pValue.value.trim())
    showPref.value = false
  } catch {
    prefError.value = 'No se pudo guardar la preferencia.'
  } finally {
    prefSaving.value = false
  }
}
async function removePref(prefId: string) {
  await customers.removePreference(props.customer.id, prefId)
}

// --- Register credit (fiado) ----------------------------------------------
const showCredit = ref(false)
const cAmount = ref<number | null>(null)
const creditSaving = ref(false)
const creditError = ref<string | null>(null)

function openCredit() {
  cAmount.value = null
  creditError.value = null
  showCredit.value = true
}
const canSubmitCredit = computed(() => cAmount.value !== null && cAmount.value > 0)
async function submitCredit() {
  if (!canSubmitCredit.value || cAmount.value === null) return
  creditSaving.value = true
  creditError.value = null
  try {
    await customers.registerCredit(props.customer.id, { total_amount: cAmount.value.toFixed(2) })
    showCredit.value = false
  } catch (e) {
    creditError.value = statusOf(e) === 422 ? 'Monto inválido.' : 'No se pudo registrar el fiado.'
  } finally {
    creditSaving.value = false
  }
}

// --- Settlement payment ----------------------------------------------------
const showPay = ref(false)
const payCredit = ref<Credit | null>(null)
const payAmount = ref<number | null>(null)
const payMethod = ref('cash')
const payEmployee = ref<string | null>(null)
const paying = ref(false)
const payError = ref<string | null>(null)

async function openPay(credit: Credit) {
  payCredit.value = credit
  payAmount.value = null
  payMethod.value = 'cash'
  payEmployee.value = null
  payError.value = null
  showPay.value = true
  await customers.loadPayments(credit.id)
}
const canSubmitPay = computed(
  () => payEmployee.value !== null && payAmount.value !== null && payAmount.value > 0,
)
async function submitPay() {
  if (!canSubmitPay.value || payCredit.value === null || payEmployee.value === null || payAmount.value === null) return
  paying.value = true
  payError.value = null
  try {
    await customers.registerCreditPayment(payCredit.value.id, {
      amount: payAmount.value.toFixed(2),
      method: payMethod.value,
      employee_id: payEmployee.value,
    })
    showPay.value = false
  } catch (e) {
    payError.value =
      statusOf(e) === 409
        ? 'No hay una caja abierta para registrar el pago en efectivo.'
        : statusOf(e) === 422
          ? 'Monto inválido.'
          : 'No se pudo registrar el pago.'
  } finally {
    paying.value = false
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

    <!-- Identity -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="truncate text-lg font-semibold text-ink">{{ fullName }}</h2>
        <p v-if="!customer.is_active" class="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-steel-500">Inactivo</p>
      </div>
      <Button
        v-if="canManage"
        :label="customer.is_active ? 'Desactivar' : 'Reactivar'"
        size="small"
        severity="secondary"
        outlined
        :icon="customer.is_active ? 'pi pi-ban' : 'pi pi-check'"
        :loading="toggling"
        @click="toggleActive"
      />
    </div>

    <dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Documento</dt>
        <dd class="text-ink">{{ customer.document_number || '—' }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Teléfono</dt>
        <dd class="text-ink">{{ customer.phone || '—' }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Correo</dt>
        <dd class="truncate text-ink">{{ customer.email || '—' }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Total gastado</dt>
        <dd class="font-mono text-ink">{{ formatCOP(customer.total_spent) }} · {{ customer.order_count }} pedidos</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Última compra</dt>
        <dd class="text-ink">{{ formatDate(customer.last_purchase_at) }}</dd>
      </div>
    </dl>

    <!-- Preferences -->
    <div class="mt-5 flex items-center justify-between gap-2">
      <h3 class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Preferencias</h3>
      <Button v-if="canManage" label="Agregar" size="small" severity="secondary" text icon="pi pi-plus" @click="openPref" />
    </div>
    <p v-if="!customers.preferences.length" class="mt-2 text-sm text-steel-500">Sin preferencias.</p>
    <ul v-else class="mt-2 flex flex-wrap gap-2">
      <li v-for="pref in customers.preferences" :key="pref.id" class="flex items-center gap-1.5 rounded-lg border border-line bg-app px-2.5 py-1">
        <span class="font-mono text-[11px] text-steel-500">{{ pref.key }}:</span>
        <span class="text-sm text-ink">{{ pref.value }}</span>
        <button v-if="canManage" type="button" class="text-steel-500 transition hover:text-alert" aria-label="Quitar" @click="removePref(pref.id)">
          <i class="pi pi-times text-[10px]" />
        </button>
      </li>
    </ul>

    <!-- Fiado credits -->
    <div class="mt-5 flex items-center justify-between gap-2">
      <h3 class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Fiado</h3>
      <Button v-if="canManage" label="Registrar fiado" size="small" icon="pi pi-plus" @click="openCredit" />
    </div>
    <p v-if="customers.credits.length" class="mt-1 font-mono text-[11px] text-steel-500">
      Saldo total: <span class="text-ink">{{ formatCOP(customers.customerOutstanding) }}</span>
    </p>
    <p v-if="!customers.credits.length" class="mt-2 text-sm text-steel-500">Sin fiados registrados.</p>
    <ul v-else class="mt-2 divide-y divide-line rounded-lg border border-line bg-paper">
      <li v-for="credit in customers.credits" :key="credit.id" class="flex items-center justify-between gap-3 px-3 py-2">
        <span class="min-w-0">
          <span class="block font-mono text-sm text-ink">{{ formatCOP(credit.total_amount) }}</span>
          <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
            {{ PAY_STATUS[credit.payment_status] ?? credit.payment_status }} · saldo {{ formatCOP(customers.creditBalance(credit.id)) }}
          </span>
        </span>
        <Button
          v-if="canManage && credit.payment_status !== 'paid'"
          label="Abonar"
          size="small"
          severity="contrast"
          icon="pi pi-wallet"
          @click="openPay(credit)"
        />
      </li>
    </ul>

    <!-- Preference dialog -->
    <Dialog v-model:visible="showPref" modal header="Agregar preferencia" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="pf-key" class="text-xs font-medium uppercase tracking-wide text-steel-500">Clave</label>
          <InputText id="pf-key" v-model="pKey" fluid autofocus maxlength="100" placeholder="ej. mesa preferida" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="pf-val" class="text-xs font-medium uppercase tracking-wide text-steel-500">Valor</label>
          <InputText id="pf-val" v-model="pValue" fluid maxlength="255" />
        </div>
        <p v-if="prefError" role="alert" class="font-mono text-xs text-alert">{{ prefError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showPref = false" />
        <Button label="Guardar" :loading="prefSaving" :disabled="!canSubmitPref" @click="submitPref" />
      </template>
    </Dialog>

    <!-- Register credit dialog -->
    <Dialog v-model:visible="showCredit" modal header="Registrar fiado" :style="{ width: '22rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="cr-amt" class="text-xs font-medium uppercase tracking-wide text-steel-500">Monto del fiado</label>
          <InputNumber id="cr-amt" v-model="cAmount" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" fluid autofocus />
        </div>
        <p v-if="creditError" role="alert" class="font-mono text-xs text-alert">{{ creditError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showCredit = false" />
        <Button label="Registrar" :loading="creditSaving" :disabled="!canSubmitCredit" @click="submitCredit" />
      </template>
    </Dialog>

    <!-- Settlement payment dialog -->
    <Dialog v-model:visible="showPay" modal header="Abonar al fiado" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div v-if="payCredit" class="flex flex-col gap-4 pt-2">
        <div class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[11px] text-steel-500">
          Saldo pendiente: <span class="text-ink">{{ formatCOP(customers.creditBalance(payCredit.id)) }}</span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="py-amt" class="text-xs font-medium uppercase tracking-wide text-steel-500">Monto</label>
            <InputNumber id="py-amt" v-model="payAmount" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="py-method" class="text-xs font-medium uppercase tracking-wide text-steel-500">Método</label>
            <Select id="py-method" v-model="payMethod" :options="METHODS" option-label="label" option-value="value" fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="py-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">Empleado</label>
          <Select id="py-emp" v-model="payEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" fluid />
        </div>
        <p v-if="payError" role="alert" class="font-mono text-xs text-alert">{{ payError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showPay = false" />
        <Button label="Registrar abono" severity="contrast" :loading="paying" :disabled="!canSubmitPay" @click="submitPay" />
      </template>
    </Dialog>
  </div>
</template>
