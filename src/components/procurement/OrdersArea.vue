<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useProcurementStore } from '@/stores/procurement'
import { usePurchasingStore } from '@/stores/purchasing'
import { useCatalogStore } from '@/stores/catalog'
import { formatCOP } from '@/lib/money'
import { formatQuantity } from '@/lib/quantity'
import { statusOf } from '@/lib/apiError'
import type { PurchaseOrder } from '@/services/purchasing.api'

defineProps<{
  employeeOptions: { label: string; value: string }[]
  supplierOptions: { label: string; value: string }[]
  canManage: boolean
}>()

const procurement = useProcurementStore()
const purchasing = usePurchasingStore()
const catalog = useCatalogStore()

const ORDER_STATUS: Record<string, string> = { created: 'Creada', partially_received: 'Parcial', received: 'Recibida' }
const PAY_STATUS: Record<string, string> = { pending: 'Sin pagar', partial: 'Parcial', paid: 'Pagada' }
const METHODS = [
  { label: 'Transferencia', value: 'transfer' },
  { label: 'Efectivo', value: 'cash' },
  { label: 'Tarjeta', value: 'card' },
  { label: 'Nequi', value: 'nequi' },
]

const statusFilter = ref<string>('all')
const statusOptions = [
  { label: 'Todas', value: 'all' },
  { label: 'Creadas', value: 'created' },
  { label: 'Parciales', value: 'partially_received' },
  { label: 'Recibidas', value: 'received' },
]

function unitAbbr(unitId: string): string {
  return catalog.units.find((u) => u.id === unitId)?.abbreviation ?? ''
}

const visibleOrders = computed<PurchaseOrder[]>(() =>
  statusFilter.value === 'all'
    ? procurement.branchOrders
    : procurement.branchOrders.filter((o) => o.status === statusFilter.value),
)

const selectedId = computed(() => procurement.selectedOrderId)
const selectedOrder = computed(() => procurement.selectedOrder)
function select(order: PurchaseOrder) {
  void procurement.selectOrder(order.id)
}

// --- New order dialog ------------------------------------------------------
interface OrderLine {
  ingredient_id: string
  unit_of_measure_id: string
  ordered_quantity: number | null
  unit_price: number | null
}
const showCreate = ref(false)
const oRequestId = ref<string | null>(null)
const oSupplier = ref<string | null>(null)
const oLines = ref<OrderLine[]>([])
const creating = ref(false)
const createError = ref<string | null>(null)

const approvedRequests = computed(() => procurement.branchRequests.filter((r) => r.status === 'approved'))

function openCreate() {
  oRequestId.value = null
  oSupplier.value = null
  oLines.value = []
  createError.value = null
  showCreate.value = true
}

// On choosing a request, pull its items as order lines (quantity pre-filled from the request).
async function onPickRequest() {
  if (!oRequestId.value) return
  await procurement.loadRequestItems(oRequestId.value)
  oLines.value = procurement.itemsOfRequest(oRequestId.value).map((it) => ({
    ingredient_id: it.ingredient_id,
    unit_of_measure_id: it.unit_of_measure_id,
    ordered_quantity: Number(it.requested_quantity),
    unit_price: null,
  }))
  if (oSupplier.value) await prefillPrices()
}

// Pre-fill each line's unit price from the supplier's catalog reference price, where available.
async function prefillPrices() {
  if (!oSupplier.value) return
  await purchasing.selectSupplier(oSupplier.value)
  for (const line of oLines.value) {
    const ref = purchasing.catalog.find((c) => c.ingredient_id === line.ingredient_id)
    if (ref && line.unit_price === null) line.unit_price = Number(ref.reference_price)
  }
}

const canCreate = computed(
  () =>
    oRequestId.value !== null &&
    oSupplier.value !== null &&
    oLines.value.length > 0 &&
    oLines.value.every((l) => l.ordered_quantity !== null && l.ordered_quantity > 0 && l.unit_price !== null && l.unit_price >= 0),
)

async function submitCreate() {
  if (!canCreate.value || oRequestId.value === null || oSupplier.value === null) return
  creating.value = true
  createError.value = null
  try {
    const order = await procurement.createOrder({
      purchase_request_id: oRequestId.value,
      supplier_id: oSupplier.value,
      items: oLines.value.map((l) => ({
        ingredient_id: l.ingredient_id,
        ordered_quantity: String(l.ordered_quantity),
        unit_price: (l.unit_price ?? 0).toFixed(2),
        unit_of_measure_id: l.unit_of_measure_id,
      })),
    })
    showCreate.value = false
    await procurement.selectOrder(order.id)
  } catch (e) {
    createError.value =
      statusOf(e) === 409 ? 'La solicitud no está aprobada o ya tiene orden.' : 'No se pudo crear la orden.'
  } finally {
    creating.value = false
  }
}

// --- Receive dialog --------------------------------------------------------
const showReceive = ref(false)
const rEmployee = ref<string | null>(null)
const rQty = ref<Record<string, number | null>>({})
const receiving = ref(false)
const receiveError = ref<string | null>(null)

function openReceive() {
  rEmployee.value = null
  rQty.value = {}
  receiveError.value = null
  showReceive.value = true
}

const receiveItems = computed(() =>
  selectedOrder.value ? procurement.itemsOfOrder(selectedOrder.value.id) : [],
)

const canReceive = computed(
  () =>
    rEmployee.value !== null &&
    Object.values(rQty.value).some((q) => q !== null && q > 0),
)

async function submitReceive() {
  if (!canReceive.value || rEmployee.value === null || !selectedOrder.value) return
  receiving.value = true
  receiveError.value = null
  try {
    const items = receiveItems.value
      .filter((it) => (rQty.value[it.id] ?? 0) > 0)
      .map((it) => ({ order_item_id: it.id, quantity: String(rQty.value[it.id]) }))
    await procurement.receiveOrder(selectedOrder.value.id, {
      received_by_employee_id: rEmployee.value,
      items,
    })
    showReceive.value = false
  } catch (e) {
    const status = statusOf(e)
    receiveError.value =
      status === 409 || status === 422
        ? 'Cantidad inválida o mayor a lo pendiente.'
        : 'No se pudo registrar la recepción.'
  } finally {
    receiving.value = false
  }
}

// --- Payment dialog --------------------------------------------------------
const showPay = ref(false)
const pAmount = ref<number | null>(null)
const pMethod = ref('transfer')
const pEmployee = ref<string | null>(null)
const paying = ref(false)
const payError = ref<string | null>(null)

function openPay() {
  pAmount.value = null
  pMethod.value = 'transfer'
  pEmployee.value = null
  payError.value = null
  showPay.value = true
}

const canPay = computed(
  () => pEmployee.value !== null && pAmount.value !== null && pAmount.value > 0,
)

async function submitPay() {
  if (!canPay.value || pEmployee.value === null || pAmount.value === null || !selectedOrder.value) return
  paying.value = true
  payError.value = null
  try {
    await procurement.registerPayment(selectedOrder.value.id, {
      amount: pAmount.value.toFixed(2),
      method: pMethod.value,
      employee_id: pEmployee.value,
    })
    showPay.value = false
  } catch (e) {
    const status = statusOf(e)
    payError.value =
      status === 409
        ? 'No hay una caja abierta para registrar el pago en efectivo.'
        : status === 422
          ? 'Monto inválido.'
          : 'No se pudo registrar el pago.'
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value" class="w-44" />
      <Button v-if="canManage" label="Nueva orden" size="small" icon="pi pi-plus" :disabled="!approvedRequests.length" @click="openCreate" />
    </div>

    <div class="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-6">
      <!-- LIST -->
      <aside class="flex flex-col gap-1.5" :class="selectedId ? 'max-lg:hidden' : ''">
        <p v-if="!visibleOrders.length" class="text-steel-500">No hay órdenes.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="order in visibleOrders" :key="order.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="selectedId === order.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="select(order)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">{{ purchasing.supplierName(order.supplier_id) }}</span>
                <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ ORDER_STATUS[order.status] ?? order.status }} · {{ PAY_STATUS[order.payment_status] ?? order.payment_status }}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <span class="font-mono text-sm text-ink">{{ formatCOP(order.total) }}</span>
                <span class="text-steel-500 lg:hidden" aria-hidden="true"><i class="pi pi-angle-right" /></span>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="selectedId ? '' : 'max-lg:hidden'">
        <div v-if="!selectedOrder" class="grid h-40 place-items-center px-6 text-center text-steel-500">
          Elige una orden para ver su detalle.
        </div>
        <div v-else class="p-4 sm:p-5">
          <button
            type="button"
            class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
            @click="procurement.selectedOrderId = null"
          >
            <i class="pi pi-angle-left" /> Volver
          </button>

          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-ink">{{ purchasing.supplierName(selectedOrder.supplier_id) }}</h3>
              <p class="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-steel-500">
                {{ ORDER_STATUS[selectedOrder.status] ?? selectedOrder.status }} · {{ PAY_STATUS[selectedOrder.payment_status] ?? selectedOrder.payment_status }}
              </p>
            </div>
            <div class="text-right">
              <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Total</p>
              <p class="font-mono text-lg font-extrabold text-ink">{{ formatCOP(selectedOrder.total) }}</p>
              <p class="font-mono text-[10px] text-steel-500">Saldo {{ formatCOP(procurement.outstandingBalance(selectedOrder.id)) }}</p>
            </div>
          </div>

          <!-- Items with received-vs-ordered progress -->
          <ul class="mt-3 divide-y divide-line rounded-lg border border-line bg-app">
            <li v-for="item in procurement.itemsOfOrder(selectedOrder.id)" :key="item.id" class="px-3 py-2">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-sm text-ink">{{ purchasing.ingredientLabel(item.ingredient_id) }}</span>
                <span class="shrink-0 font-mono text-sm text-ink">{{ formatCOP(item.unit_price) }}</span>
              </div>
              <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
                Recibido {{ formatQuantity(item.received_quantity, unitAbbr(item.unit_of_measure_id)) }}
                / {{ formatQuantity(item.ordered_quantity, unitAbbr(item.unit_of_measure_id)) }}
              </p>
            </li>
          </ul>

          <!-- Actions -->
          <div v-if="canManage" class="mt-4 flex flex-wrap gap-2">
            <Button v-if="selectedOrder.status !== 'received'" label="Recibir" size="small" icon="pi pi-box" @click="openReceive" />
            <Button v-if="selectedOrder.payment_status !== 'paid'" label="Registrar pago" size="small" severity="contrast" icon="pi pi-wallet" @click="openPay" />
          </div>

          <!-- Payments -->
          <template v-if="procurement.paymentsOf(selectedOrder.id).length">
            <h4 class="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Pagos</h4>
            <ul class="mt-2 divide-y divide-line rounded-lg border border-line bg-paper">
              <li v-for="pay in procurement.paymentsOf(selectedOrder.id)" :key="pay.id" class="flex items-center justify-between gap-3 px-3 py-2">
                <span class="font-mono text-[11px] uppercase tracking-wide text-steel-500">{{ pay.method }}</span>
                <span class="font-mono text-sm text-ink">{{ formatCOP(pay.amount) }}</span>
              </li>
            </ul>
          </template>
        </div>
      </section>
    </div>

    <!-- New order dialog -->
    <Dialog v-model:visible="showCreate" modal header="Nueva orden de compra" :style="{ width: '36rem' }" :breakpoints="{ '600px': '94vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="o-req" class="text-xs font-medium uppercase tracking-wide text-steel-500">Solicitud aprobada</label>
            <Select id="o-req" v-model="oRequestId" :options="approvedRequests.map((r) => ({ label: r.reason || `Solicitud ${r.id.slice(0, 8)}`, value: r.id }))" option-label="label" option-value="value" placeholder="Elige una solicitud" fluid @change="onPickRequest" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="o-sup" class="text-xs font-medium uppercase tracking-wide text-steel-500">Proveedor</label>
            <Select id="o-sup" v-model="oSupplier" :options="supplierOptions" option-label="label" option-value="value" placeholder="Proveedor" fluid @change="prefillPrices" />
          </div>
        </div>

        <p v-if="!oLines.length" class="text-sm text-steel-500">Elige una solicitud aprobada para cargar sus ítems.</p>
        <div v-else class="flex flex-col gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-steel-500">Ítems</span>
          <div v-for="line in oLines" :key="line.ingredient_id" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ purchasing.ingredientLabel(line.ingredient_id) }}</span>
            <InputNumber v-model="line.ordered_quantity" :min="0" :max-fraction-digits="3" placeholder="Cant." class="w-24" />
            <InputNumber v-model="line.unit_price" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" placeholder="Precio" class="w-32" />
          </div>
        </div>

        <p v-if="createError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ createError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showCreate = false" />
        <Button label="Crear orden" :loading="creating" :disabled="!canCreate" @click="submitCreate" />
      </template>
    </Dialog>

    <!-- Receive dialog -->
    <Dialog v-model:visible="showReceive" modal header="Recibir mercancía" :style="{ width: '30rem' }" :breakpoints="{ '520px': '94vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="rc-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">Recibe</label>
          <Select id="rc-emp" v-model="rEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-steel-500">Cantidades recibidas</span>
          <div v-for="item in receiveItems" :key="item.id" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm text-ink">
              {{ purchasing.ingredientLabel(item.ingredient_id) }}
              <span class="font-mono text-[10px] text-steel-500">
                (faltan {{ procurement.receiptProgress(item).remaining }} {{ unitAbbr(item.unit_of_measure_id) }})
              </span>
            </span>
            <InputNumber
              v-model="rQty[item.id]"
              :min="0"
              :max="procurement.receiptProgress(item).remaining"
              :max-fraction-digits="3"
              placeholder="0"
              class="w-28"
            />
          </div>
        </div>
        <p v-if="receiveError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ receiveError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showReceive = false" />
        <Button label="Registrar recepción" :loading="receiving" :disabled="!canReceive" @click="submitReceive" />
      </template>
    </Dialog>

    <!-- Payment dialog -->
    <Dialog v-model:visible="showPay" modal header="Registrar pago" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div v-if="selectedOrder" class="flex flex-col gap-4 pt-2">
        <div class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[11px] text-steel-500">
          Saldo pendiente: <span class="text-ink">{{ formatCOP(procurement.outstandingBalance(selectedOrder.id)) }}</span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="p-amount" class="text-xs font-medium uppercase tracking-wide text-steel-500">Monto</label>
            <InputNumber id="p-amount" v-model="pAmount" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="p-method" class="text-xs font-medium uppercase tracking-wide text-steel-500">Método</label>
            <Select id="p-method" v-model="pMethod" :options="METHODS" option-label="label" option-value="value" fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="p-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">Empleado</label>
          <Select id="p-emp" v-model="pEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" fluid />
        </div>
        <p v-if="payError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ payError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showPay = false" />
        <Button label="Registrar pago" severity="contrast" :loading="paying" :disabled="!canPay" @click="submitPay" />
      </template>
    </Dialog>
  </div>
</template>
