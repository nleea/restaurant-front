<script setup lang="ts">
// Órdenes — the default Compras board area, wired to real branch-scoped data. El Pase board over
// purchase orders: stats · combined filters with chips · sortable table / cards with the
// receipt-progress bar and status+payment pills · a slide-in detail drawer (Detalles/Ítems/Pagos)
// · Recibir and Registrar pago modals · Nueva orden desde solicitud aprobada · alerts + CSV.
// Receive/pay/create need `purchasing.manage`; with `purchasing.read` alone it is read-only.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useProcurementStore } from '@/stores/procurement'
import { usePurchasingStore } from '@/stores/purchasing'
import { useCatalogStore } from '@/stores/catalog'
import { useStaffStore } from '@/stores/staff'
import { formatCOP } from '@/lib/money'
import { formatQuantity } from '@/lib/quantity'
import { statusOf } from '@/lib/apiError'
import ProgressBar from '@/components/purchasing/ProgressBar.vue'
import {
  orderMeta,
  orderRowTint,
  orderStatusOf,
  paymentMeta,
  ORDER_STATUS_META,
} from '@/components/purchasing/orderStatus'
import type { PurchaseOrder } from '@/services/purchasing.api'

const props = defineProps<{ canManage: boolean }>()

const procurement = useProcurementStore()
const purchasing = usePurchasingStore()
const catalog = useCatalogStore()
const staff = useStaffStore()

const PAY_METHODS = [
  { label: 'Transferencia', value: 'transfer' },
  { label: 'Efectivo', value: 'cash' },
  { label: 'Tarjeta', value: 'card' },
  { label: 'Nequi', value: 'nequi' },
]

function unitAbbr(unitId: string): string {
  return catalog.units.find((u) => u.id === unitId)?.abbreviation ?? ''
}
function orderRef(order: PurchaseOrder): string {
  return `#${order.id.slice(0, 8)}`
}

const employeeOptions = computed(() =>
  staff.employees
    .filter((e) => e.is_active)
    .map((e) => ({ label: staff.employeeName(e), value: e.id })),
)
const supplierPickerOptions = computed(() =>
  purchasing.activeSuppliers.map((s) => ({ label: s.name, value: s.id })),
)

// --- Filters + sort -------------------------------------------------------------------------
const query = ref('')
const fSupplier = ref<string>('all')
const fStatus = ref<string>('all')
const supplierOptions = computed(() => [
  { label: 'Todos los proveedores', value: 'all' },
  ...procurement.distinctOrderSupplierIds
    .map((id) => ({ label: purchasing.supplierName(id), value: id }))
    .sort((a, b) => a.label.localeCompare(b.label)),
])
const statusOptions = [
  { label: 'Todos los estados', value: 'all' },
  { label: 'Creadas', value: 'created' },
  { label: 'Parciales', value: 'partially_received' },
  { label: 'Recibidas', value: 'received' },
]

type SortKey = 'supplier' | 'total' | 'status'
const sortKey = ref<SortKey>('supplier')
const sortAsc = ref(true)
function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = true
  }
}
const sortOptions = [
  { label: 'Proveedor A–Z', value: 'supplier-asc' },
  { label: 'Total ↑', value: 'total-asc' },
  { label: 'Total ↓', value: 'total-desc' },
  { label: 'Estado', value: 'status-asc' },
]
const sortValue = computed({
  get: () => `${sortKey.value}-${sortAsc.value ? 'asc' : 'desc'}`,
  set: (v: string) => {
    const [key, dir] = v.split('-')
    sortKey.value = key as SortKey
    sortAsc.value = dir === 'asc'
  },
})

const STATUS_ORDER: Record<string, number> = { created: 0, partially_received: 1, received: 2 }
const filtered = computed<PurchaseOrder[]>(() => {
  const q = query.value.trim().toLowerCase()
  const list = procurement.branchOrders.filter((o) => {
    if (fSupplier.value !== 'all' && o.supplier_id !== fSupplier.value) return false
    if (fStatus.value !== 'all' && orderStatusOf(o) !== fStatus.value) return false
    if (q && !`${purchasing.supplierName(o.supplier_id)} ${orderRef(o)}`.toLowerCase().includes(q))
      return false
    return true
  })
  const dir = sortAsc.value ? 1 : -1
  return [...list].sort((a, b) => {
    switch (sortKey.value) {
      case 'total':
        return (Number(a.total) - Number(b.total)) * dir
      case 'status':
        return ((STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0)) * dir
      default:
        return (
          purchasing.supplierName(a.supplier_id).localeCompare(purchasing.supplierName(b.supplier_id)) *
          dir
        )
    }
  })
})

interface Chip {
  label: string
  clear: () => void
}
const chips = computed<Chip[]>(() => {
  const list: Chip[] = []
  if (fSupplier.value !== 'all')
    list.push({
      label: `Proveedor: ${purchasing.supplierName(fSupplier.value)}`,
      clear: () => (fSupplier.value = 'all'),
    })
  if (fStatus.value !== 'all') {
    const label = statusOptions.find((o) => o.value === fStatus.value)?.label ?? fStatus.value
    list.push({ label, clear: () => (fStatus.value = 'all') })
  }
  return list
})
function clearFilters() {
  fSupplier.value = 'all'
  fStatus.value = 'all'
  query.value = ''
}

const stats = computed(() => procurement.orderStats)

// --- View mode ------------------------------------------------------------------------------
const viewMode = ref<'list' | 'cards'>('list')

// --- Alerts affordance ----------------------------------------------------------------------
const showAlerts = ref(false)
const alertOutstanding = computed(() => procurement.ordersWithOutstanding)
const alertPartial = computed(() => procurement.partiallyReceivedOrders)
const alertCount = computed(() => alertOutstanding.value.length + alertPartial.value.length)

// --- Row menu -------------------------------------------------------------------------------
const menuFor = ref<string | null>(null)
function onDocClick() {
  menuFor.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

// --- CSV export -----------------------------------------------------------------------------
function exportCsv(orders: PurchaseOrder[]) {
  const head = 'orden,proveedor,estado,pago,total,saldo'
  const lines = orders.map((o) =>
    [
      orderRef(o),
      `"${purchasing.supplierName(o.supplier_id)}"`,
      orderMeta(o).label,
      paymentMeta(o).label,
      o.total,
      procurement.outstandingBalance(o.id),
    ].join(','),
  )
  const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'compras-ordenes.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// --- Detail drawer --------------------------------------------------------------------------
type DrawerTab = 'details' | 'items' | 'payments'
const openId = ref<string | null>(null)
const drawerTab = ref<DrawerTab>('details')
const openOrder = computed(() => procurement.branchOrders.find((o) => o.id === openId.value) ?? null)
const drawerTabs: { value: DrawerTab; label: string }[] = [
  { value: 'details', label: 'Detalles' },
  { value: 'items', label: 'Ítems' },
  { value: 'payments', label: 'Pagos' },
]
async function openDetail(order: PurchaseOrder, tab: DrawerTab = 'details') {
  openId.value = order.id
  drawerTab.value = tab
  menuFor.value = null
  await procurement.selectOrder(order.id)
}
function closeDrawer() {
  openId.value = null
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && openId.value) closeDrawer()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// --- Recibir mercancía modal ----------------------------------------------------------------
const showReceive = ref(false)
const rcOrderId = ref<string | null>(null)
const rcEmployee = ref<string | null>(null)
const rcQty = ref<Record<string, number | null>>({})
const rcSaving = ref(false)
const rcError = ref<string | null>(null)
const rcOrder = computed(() => procurement.branchOrders.find((o) => o.id === rcOrderId.value) ?? null)
const rcItems = computed(() => (rcOrderId.value ? procurement.itemsOfOrder(rcOrderId.value) : []))
async function openReceive(order: PurchaseOrder) {
  menuFor.value = null
  await procurement.selectOrder(order.id)
  rcOrderId.value = order.id
  rcEmployee.value = employeeOptions.value.length === 1 ? (employeeOptions.value[0]?.value ?? null) : null
  rcQty.value = {}
  rcError.value = null
  showReceive.value = true
}
const rcValid = computed(
  () => rcEmployee.value !== null && Object.values(rcQty.value).some((q) => q !== null && q > 0),
)
async function submitReceive() {
  if (!rcValid.value || rcEmployee.value === null || !rcOrder.value) return
  rcSaving.value = true
  rcError.value = null
  try {
    const items = rcItems.value
      .filter((it) => (rcQty.value[it.id] ?? 0) > 0)
      .map((it) => ({ order_item_id: it.id, quantity: String(rcQty.value[it.id]) }))
    await procurement.receiveOrder(rcOrder.value.id, {
      received_by_employee_id: rcEmployee.value,
      items,
    })
    showReceive.value = false
  } catch (e) {
    const status = statusOf(e)
    rcError.value =
      status === 409 || status === 422
        ? 'Cantidad inválida o mayor a lo pendiente.'
        : 'No se pudo registrar la recepción.'
  } finally {
    rcSaving.value = false
  }
}

// --- Registrar pago modal -------------------------------------------------------------------
const showPay = ref(false)
const pyOrderId = ref<string | null>(null)
const pyAmount = ref<number | null>(null)
const pyMethod = ref('transfer')
const pyEmployee = ref<string | null>(null)
const pySaving = ref(false)
const pyError = ref<string | null>(null)
const pyOrder = computed(() => procurement.branchOrders.find((o) => o.id === pyOrderId.value) ?? null)
async function openPay(order: PurchaseOrder) {
  menuFor.value = null
  await procurement.selectOrder(order.id)
  pyOrderId.value = order.id
  pyAmount.value = null
  pyMethod.value = 'transfer'
  pyEmployee.value = employeeOptions.value.length === 1 ? (employeeOptions.value[0]?.value ?? null) : null
  pyError.value = null
  showPay.value = true
}
const pyValid = computed(
  () => pyEmployee.value !== null && pyAmount.value !== null && pyAmount.value > 0,
)
async function submitPay() {
  if (!pyValid.value || pyEmployee.value === null || pyAmount.value === null || !pyOrder.value) return
  pySaving.value = true
  pyError.value = null
  try {
    await procurement.registerPayment(pyOrder.value.id, {
      amount: pyAmount.value.toFixed(2),
      method: pyMethod.value,
      employee_id: pyEmployee.value,
    })
    showPay.value = false
  } catch (e) {
    const status = statusOf(e)
    pyError.value =
      status === 409
        ? 'No hay una caja abierta para registrar el pago en efectivo.'
        : status === 422
          ? 'Monto inválido.'
          : 'No se pudo registrar el pago.'
  } finally {
    pySaving.value = false
  }
}

// --- Nueva orden modal (desde solicitud aprobada) -------------------------------------------
interface OrderLine {
  ingredient_id: string
  unit_of_measure_id: string
  ordered_quantity: number | null
  unit_price: number | null
}
const showCreate = ref(false)
const coRequestId = ref<string | null>(null)
const coSupplier = ref<string | null>(null)
const coLines = ref<OrderLine[]>([])
const coSaving = ref(false)
const coError = ref<string | null>(null)
const approvedRequests = computed(() =>
  procurement.branchRequests.filter((r) => r.status === 'approved'),
)
const approvedRequestOptions = computed(() =>
  approvedRequests.value.map((r) => ({
    label: r.reason || `Solicitud ${r.id.slice(0, 8)}`,
    value: r.id,
  })),
)
async function openCreate(requestId?: string) {
  coSupplier.value = null
  coLines.value = []
  coError.value = null
  coRequestId.value = requestId ?? null
  showCreate.value = true
  if (requestId) await onPickRequest()
}
async function onPickRequest() {
  if (!coRequestId.value) return
  await procurement.loadRequestItems(coRequestId.value)
  coLines.value = procurement.itemsOfRequest(coRequestId.value).map((it) => ({
    ingredient_id: it.ingredient_id,
    unit_of_measure_id: it.unit_of_measure_id,
    ordered_quantity: Number(it.requested_quantity),
    unit_price: null,
  }))
  if (coSupplier.value) await prefillPrices()
}
async function prefillPrices() {
  if (!coSupplier.value) return
  await purchasing.selectSupplier(coSupplier.value)
  for (const line of coLines.value) {
    const refP = purchasing.catalog.find((c) => c.ingredient_id === line.ingredient_id)
    if (refP && line.unit_price === null) line.unit_price = Number(refP.reference_price)
  }
}
const coValid = computed(
  () =>
    coRequestId.value !== null &&
    coSupplier.value !== null &&
    coLines.value.length > 0 &&
    coLines.value.every(
      (l) =>
        l.ordered_quantity !== null &&
        l.ordered_quantity > 0 &&
        l.unit_price !== null &&
        l.unit_price >= 0,
    ),
)
async function submitCreate() {
  if (!coValid.value || coRequestId.value === null || coSupplier.value === null) return
  coSaving.value = true
  coError.value = null
  try {
    const order = await procurement.createOrder({
      purchase_request_id: coRequestId.value,
      supplier_id: coSupplier.value,
      items: coLines.value.map((l) => ({
        ingredient_id: l.ingredient_id,
        ordered_quantity: String(l.ordered_quantity),
        unit_price: (l.unit_price ?? 0).toFixed(2),
        unit_of_measure_id: l.unit_of_measure_id,
      })),
    })
    showCreate.value = false
    await openDetail(order)
  } catch (e) {
    coError.value =
      statusOf(e) === 409
        ? 'La solicitud no está aprobada o ya tiene orden.'
        : 'No se pudo crear la orden.'
  } finally {
    coSaving.value = false
  }
}

defineExpose({ openCreate })
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Alerts affordance -->
    <div v-if="alertCount" class="card overflow-hidden">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-sunken/60"
        @click="showAlerts = !showAlerts"
      >
        <i class="pi pi-exclamation-triangle text-sm text-warn-600" />
        <span class="text-sm font-medium text-ink">
          {{ alertOutstanding.length }} con saldo pendiente · {{ alertPartial.length }} parcialmente recibidas
        </span>
        <i class="pi ml-auto text-xs text-steel-500" :class="showAlerts ? 'pi-chevron-up' : 'pi-chevron-down'" />
      </button>
      <div v-if="showAlerts" class="flex flex-col gap-2 border-t border-hairline p-3">
        <div
          v-for="o in alertOutstanding.slice(0, 8)"
          :key="`bal-${o.id}`"
          class="flex items-center gap-3 rounded-lg border-l-4 border-l-alert bg-paper px-3 py-2"
        >
          <button type="button" class="min-w-0 flex-1 text-left" @click="openDetail(o, 'payments')">
            <span class="block truncate text-sm font-medium text-ink">{{ purchasing.supplierName(o.supplier_id) }}</span>
            <span class="block font-mono text-[10px] text-steel-500">
              {{ orderRef(o) }} · saldo {{ formatCOP(procurement.outstandingBalance(o.id)) }}
            </span>
          </button>
          <Button
            v-if="props.canManage"
            label="Registrar pago"
            size="small"
            severity="secondary"
            outlined
            icon="pi pi-wallet"
            @click="openPay(o)"
          />
        </div>
        <div
          v-for="o in alertPartial.slice(0, 8)"
          :key="`par-${o.id}`"
          class="flex items-center gap-3 rounded-lg border-l-4 border-l-warn bg-paper px-3 py-2"
        >
          <button type="button" class="min-w-0 flex-1 text-left" @click="openDetail(o, 'items')">
            <span class="block truncate text-sm font-medium text-ink">{{ purchasing.supplierName(o.supplier_id) }}</span>
            <span class="block font-mono text-[10px] text-steel-500">{{ orderRef(o) }} · parcialmente recibida</span>
          </button>
          <Button
            v-if="props.canManage"
            label="Recibir"
            size="small"
            severity="secondary"
            outlined
            icon="pi pi-box"
            @click="openReceive(o)"
          />
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div class="card animate-docket px-4 py-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Total órdenes</p>
        <p class="mt-0.5 font-display text-3xl font-bold text-ink">{{ stats.total }}</p>
      </div>
      <div class="card animate-docket px-4 py-3" style="animation-delay: 40ms">
        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Parciales</p>
        <p class="mt-0.5 font-display text-3xl font-bold text-warn-600">{{ stats.partiallyReceived }}</p>
      </div>
      <div class="card animate-docket px-4 py-3" style="animation-delay: 80ms">
        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Recibidas</p>
        <p class="mt-0.5 font-display text-3xl font-bold text-success-600">{{ stats.received }}</p>
      </div>
      <div class="card animate-docket px-4 py-3" style="animation-delay: 120ms">
        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Por pagar</p>
        <p class="mt-0.5 font-display text-2xl font-bold text-ink">{{ formatCOP(stats.payable) || '$ 0' }}</p>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative">
        <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-steel-400" />
        <input
          v-model="query"
          type="search"
          placeholder="Buscar proveedor o nº orden…"
          class="w-60 rounded-lg border border-line bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-steel-400"
        />
      </div>
      <Select v-model="fSupplier" :options="supplierOptions" option-label="label" option-value="value" size="small" class="w-52" />
      <Select v-model="fStatus" :options="statusOptions" option-label="label" option-value="value" size="small" class="w-44" />
      <div class="ml-auto flex items-center gap-2">
        <Button
          v-if="props.canManage"
          label="Nueva orden"
          size="small"
          icon="pi pi-plus"
          :disabled="!approvedRequests.length"
          @click="openCreate()"
        />
        <Button label="Exportar" size="small" severity="secondary" outlined icon="pi pi-download" @click="exportCsv(filtered)" />
        <Select v-model="sortValue" :options="sortOptions" option-label="label" option-value="value" size="small" class="w-44" />
        <div class="flex gap-1 rounded-lg border border-line bg-app p-1">
          <button
            type="button"
            aria-label="Vista de lista"
            class="grid h-7 w-8 place-items-center rounded-md transition"
            :class="viewMode === 'list' ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
            @click="viewMode = 'list'"
          >
            <i class="pi pi-bars text-xs" />
          </button>
          <button
            type="button"
            aria-label="Vista de tarjetas"
            class="grid h-7 w-8 place-items-center rounded-md transition"
            :class="viewMode === 'cards' ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
            @click="viewMode = 'cards'"
          >
            <i class="pi pi-th-large text-xs" />
          </button>
        </div>
      </div>
    </div>

    <!-- Active filter chips -->
    <div v-if="chips.length" class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="chip in chips"
        :key="chip.label"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember-50 px-3 py-1 font-mono text-[11px] text-ember-600 transition hover:border-ember/60"
        @click="chip.clear()"
      >
        {{ chip.label }}
        <i class="pi pi-times text-[9px]" />
      </button>
      <button
        type="button"
        class="font-mono text-[11px] uppercase tracking-wide text-steel-500 underline-offset-2 hover:text-ink hover:underline"
        @click="clearFilters"
      >
        Limpiar filtros
      </button>
    </div>

    <!-- LIST VIEW -->
    <div v-if="viewMode === 'list'" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[52rem] text-sm">
          <thead>
            <tr class="bg-sunken">
              <th class="px-3 py-2.5 text-left">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition"
                  :class="sortKey === 'supplier' ? 'text-ember-600' : 'text-steel-500 hover:text-ink'"
                  @click="toggleSort('supplier')"
                >
                  Proveedor
                  <i v-if="sortKey === 'supplier'" class="pi text-[9px]" :class="sortAsc ? 'pi-arrow-up' : 'pi-arrow-down'" />
                </button>
              </th>
              <th class="px-3 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-steel-500">Orden</th>
              <th class="px-3 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-steel-500">Recepción</th>
              <th class="px-3 py-2.5 text-right">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition"
                  :class="sortKey === 'total' ? 'text-ember-600' : 'text-steel-500 hover:text-ink'"
                  @click="toggleSort('total')"
                >
                  Total
                  <i v-if="sortKey === 'total'" class="pi text-[9px]" :class="sortAsc ? 'pi-arrow-up' : 'pi-arrow-down'" />
                </button>
              </th>
              <th class="px-3 py-2.5 text-left">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition"
                  :class="sortKey === 'status' ? 'text-ember-600' : 'text-steel-500 hover:text-ink'"
                  @click="toggleSort('status')"
                >
                  Estado
                  <i v-if="sortKey === 'status'" class="pi text-[9px]" :class="sortAsc ? 'pi-arrow-up' : 'pi-arrow-down'" />
                </button>
              </th>
              <th class="px-3 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-steel-500">Pago</th>
              <th class="w-10 px-2 py-2.5" />
            </tr>
          </thead>

          <tbody v-if="!filtered.length">
            <tr>
              <td colspan="7" class="px-6 py-14 text-center">
                <i class="pi pi-inbox text-2xl text-steel-300" />
                <p class="mt-2 text-sm text-steel-500">No se encontraron órdenes con estos filtros.</p>
                <Button label="Limpiar filtros" size="small" severity="secondary" text class="mt-2" @click="clearFilters" />
              </td>
            </tr>
          </tbody>

          <tbody v-else>
            <tr
              v-for="o in filtered"
              :key="o.id"
              class="cursor-pointer border-b border-hairline transition-colors duration-100 hover:bg-sunken/60"
              :class="orderRowTint(o)"
              @click="openDetail(o)"
            >
              <td class="px-3 py-2.5">
                <span class="flex items-center gap-2.5">
                  <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-graphite-900 font-mono text-[11px] font-semibold text-paper">
                    {{ (purchasing.supplierName(o.supplier_id)[0] ?? '?').toUpperCase() }}
                  </span>
                  <span class="truncate font-medium text-ink">{{ purchasing.supplierName(o.supplier_id) }}</span>
                </span>
              </td>
              <td class="px-3 py-2.5 font-mono text-[11px] text-steel-500">{{ orderRef(o) }}</td>
              <td class="px-3 py-2.5">
                <ProgressBar
                  :pct="procurement.orderProgress(o.id).pct"
                  :bar-class="orderMeta(o).bar"
                  width-class="w-20"
                />
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-sm text-ink">{{ formatCOP(o.total) }}</td>
              <td class="px-3 py-2.5">
                <span class="pill" :class="orderMeta(o).pill">{{ orderMeta(o).label }}</span>
              </td>
              <td class="px-3 py-2.5">
                <span class="pill" :class="paymentMeta(o).pill">{{ paymentMeta(o).label }}</span>
              </td>
              <td class="relative px-2 py-2.5" @click.stop>
                <button
                  type="button"
                  aria-label="Acciones"
                  class="grid h-7 w-7 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink"
                  @click.stop="menuFor = menuFor === o.id ? null : o.id"
                >
                  <i class="pi pi-ellipsis-v text-xs" />
                </button>
                <div v-if="menuFor === o.id" class="card absolute right-2 top-9 z-20 w-44 overflow-hidden py-1 text-left" @click.stop>
                  <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink transition hover:bg-sunken" @click="openDetail(o, 'items')">
                    <i class="pi pi-list text-xs text-steel-500" /> Ver ítems
                  </button>
                  <button
                    v-if="props.canManage && o.status !== 'received'"
                    type="button"
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink transition hover:bg-sunken"
                    @click="openReceive(o)"
                  >
                    <i class="pi pi-box text-xs text-steel-500" /> Recibir
                  </button>
                  <button
                    v-if="props.canManage && o.payment_status !== 'paid'"
                    type="button"
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink transition hover:bg-sunken"
                    @click="openPay(o)"
                  >
                    <i class="pi pi-wallet text-xs text-steel-500" /> Registrar pago
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CARD VIEW -->
    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <div v-if="!filtered.length" class="col-span-full rounded-xl border border-dashed border-line bg-paper/60 p-10 text-center">
        <i class="pi pi-inbox text-2xl text-steel-300" />
        <p class="mt-2 text-sm text-steel-500">No se encontraron órdenes con estos filtros.</p>
        <Button label="Limpiar filtros" size="small" severity="secondary" text class="mt-2" @click="clearFilters" />
      </div>
      <div
        v-for="(o, i) in filtered"
        :key="o.id"
        class="card animate-docket cursor-pointer overflow-hidden transition hover:border-steel-400"
        :style="{ animationDelay: `${Math.min(i, 12) * 30}ms` }"
        @click="openDetail(o)"
      >
        <div class="flex flex-col gap-2 p-3.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-medium text-ink">{{ purchasing.supplierName(o.supplier_id) }}</p>
              <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ orderRef(o) }}</p>
            </div>
            <span class="pill shrink-0" :class="orderMeta(o).pill">{{ orderMeta(o).label }}</span>
          </div>
          <div class="mt-1 flex items-baseline justify-between">
            <span class="font-mono text-sm text-ink">{{ formatCOP(o.total) }}</span>
            <span class="pill" :class="paymentMeta(o).pill">{{ paymentMeta(o).label }}</span>
          </div>
          <ProgressBar :pct="procurement.orderProgress(o.id).pct" :bar-class="orderMeta(o).bar" />
          <div class="mt-2 flex gap-2" @click.stop>
            <Button label="Detalle" size="small" severity="secondary" text class="flex-1" @click="openDetail(o)" />
            <Button
              v-if="props.canManage && o.status !== 'received'"
              label="Recibir"
              size="small"
              severity="secondary"
              outlined
              class="flex-1"
              @click="openReceive(o)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Detail drawer ──────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="openOrder" class="fixed inset-0 z-40 bg-graphite-900/30" @click="closeDrawer" />
      <Transition name="detail">
        <aside
          v-if="openOrder"
          class="fixed inset-y-0 right-0 z-50 flex w-full max-w-[26rem] flex-col border-l border-line bg-paper shadow-2xl"
        >
          <!-- Header -->
          <div class="border-b border-hairline p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="truncate font-display text-xl font-bold text-ink">{{ purchasing.supplierName(openOrder.supplier_id) }}</h2>
                <p class="font-mono text-[11px] text-steel-500">{{ orderRef(openOrder) }}</p>
              </div>
              <Button icon="pi pi-times" size="small" severity="secondary" text aria-label="Cerrar" @click="closeDrawer" />
            </div>
            <div class="mt-2 flex items-center gap-1.5">
              <span class="pill" :class="orderMeta(openOrder).pill">{{ orderMeta(openOrder).label }}</span>
              <span class="pill" :class="paymentMeta(openOrder).pill">{{ paymentMeta(openOrder).label }}</span>
            </div>
            <div class="mt-3">
              <ProgressBar
                :pct="procurement.orderProgress(openOrder.id).pct"
                :bar-class="orderMeta(openOrder).bar"
                height-class="h-1.5"
              />
            </div>
            <nav class="mt-3 flex gap-1 rounded-lg border border-line bg-app p-0.5">
              <button
                v-for="t in drawerTabs"
                :key="t.value"
                type="button"
                class="flex-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition"
                :class="drawerTab === t.value ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
                @click="drawerTab = t.value"
              >
                {{ t.label }}
              </button>
            </nav>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-5">
            <!-- Detalles -->
            <template v-if="drawerTab === 'details'">
              <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
                <div class="col-span-2">
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Proveedor</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ purchasing.supplierName(openOrder.supplier_id) }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Estado</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ orderMeta(openOrder).label }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Pago</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ paymentMeta(openOrder).label }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Total</dt>
                  <dd class="mt-0.5 font-mono text-sm text-ink">{{ formatCOP(openOrder.total) }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Saldo</dt>
                  <dd class="mt-0.5 font-mono text-sm text-ink">{{ formatCOP(procurement.outstandingBalance(openOrder.id)) }}</dd>
                </div>
              </dl>
              <h3 class="mt-6 eyebrow">Recepción</h3>
              <div class="mt-2.5">
                <ProgressBar
                  :pct="procurement.orderProgress(openOrder.id).pct"
                  :bar-class="orderMeta(openOrder).bar"
                  height-class="h-2"
                />
              </div>
              <p class="mt-1.5 font-mono text-[11px] text-steel-500">
                {{ procurement.orderProgress(openOrder.id).pct }}% recibido
              </p>
            </template>

            <!-- Ítems -->
            <template v-else-if="drawerTab === 'items'">
              <p v-if="!procurement.itemsOfOrder(openOrder.id).length" class="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
                Sin ítems.
              </p>
              <ul v-else class="flex flex-col gap-2.5">
                <li v-for="item in procurement.itemsOfOrder(openOrder.id)" :key="item.id">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate text-sm text-ink">{{ purchasing.ingredientLabel(item.ingredient_id) }}</span>
                    <span class="shrink-0 font-mono text-sm text-ink">{{ formatCOP(item.unit_price) }}</span>
                  </div>
                  <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
                    Recibido {{ formatQuantity(item.received_quantity, unitAbbr(item.unit_of_measure_id)) }}
                    / {{ formatQuantity(item.ordered_quantity, unitAbbr(item.unit_of_measure_id)) }}
                  </p>
                  <div class="mt-1">
                    <ProgressBar
                      :pct="procurement.receiptProgress(item).done ? 100 : (Number(item.received_quantity) / (Number(item.ordered_quantity) || 1)) * 100"
                      :bar-class="ORDER_STATUS_META[procurement.receiptProgress(item).done ? 'received' : Number(item.received_quantity) > 0 ? 'partially_received' : 'created'].bar"
                    />
                  </div>
                </li>
              </ul>
            </template>

            <!-- Pagos -->
            <template v-else>
              <div class="mb-3 rounded-lg border border-line bg-app px-3 py-2 font-mono text-[11px] text-steel-500">
                Saldo pendiente: <span class="text-ink">{{ formatCOP(procurement.outstandingBalance(openOrder.id)) }}</span>
              </div>
              <p v-if="!procurement.paymentsOf(openOrder.id).length" class="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
                Sin pagos registrados.
              </p>
              <ol v-else class="flex flex-col gap-2.5">
                <li v-for="pay in procurement.paymentsOf(openOrder.id)" :key="pay.id" class="flex items-center gap-3">
                  <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success/10 text-success-600">
                    <i class="pi pi-wallet text-[10px]" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm text-ink">{{ formatCOP(pay.amount) }}</span>
                    <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ pay.method }}</span>
                  </span>
                </li>
              </ol>
            </template>
          </div>

          <!-- Footer -->
          <div v-if="props.canManage" class="flex gap-2 border-t border-hairline p-4">
            <Button
              v-if="openOrder.status !== 'received'"
              label="Recibir"
              icon="pi pi-box"
              size="small"
              class="flex-1"
              @click="openReceive(openOrder)"
            />
            <Button
              v-if="openOrder.payment_status !== 'paid'"
              label="Registrar pago"
              icon="pi pi-wallet"
              size="small"
              severity="contrast"
              class="flex-1"
              @click="openPay(openOrder)"
            />
          </div>
        </aside>
      </Transition>
    </Teleport>

    <!-- ── Recibir mercancía modal ─────────────────────────────────────────── -->
    <Dialog v-model:visible="showReceive" modal header="Recibir mercancía" :style="{ width: '30rem' }" :breakpoints="{ '520px': '94vw' }">
      <div v-if="rcOrder" class="flex flex-col gap-4 pt-1">
        <p class="text-sm text-muted">
          {{ purchasing.supplierName(rcOrder.supplier_id) }} · <span class="font-mono text-ink">{{ orderRef(rcOrder) }}</span>
        </p>
        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Recibe</label>
          <Select v-model="rcEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Elige un empleado" size="small" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Cantidades recibidas</span>
          <div v-for="item in rcItems" :key="item.id" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm text-ink">
              {{ purchasing.ingredientLabel(item.ingredient_id) }}
              <span class="font-mono text-[10px] text-steel-500">
                (faltan {{ procurement.receiptProgress(item).remaining }} {{ unitAbbr(item.unit_of_measure_id) }})
              </span>
            </span>
            <InputNumber
              v-model="rcQty[item.id]"
              :min="0"
              :max="procurement.receiptProgress(item).remaining"
              :max-fraction-digits="3"
              placeholder="0"
              class="w-28"
            />
          </div>
        </div>
        <p v-if="rcError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ rcError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="showReceive = false" />
        <Button label="Registrar recepción" size="small" :loading="rcSaving" :disabled="!rcValid" @click="submitReceive" />
      </template>
    </Dialog>

    <!-- ── Registrar pago modal ────────────────────────────────────────────── -->
    <Dialog v-model:visible="showPay" modal header="Registrar pago" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div v-if="pyOrder" class="flex flex-col gap-4 pt-1">
        <div class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[11px] text-steel-500">
          Saldo pendiente: <span class="text-ink">{{ formatCOP(procurement.outstandingBalance(pyOrder.id)) }}</span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="py-amount" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Monto</label>
            <InputNumber id="py-amount" v-model="pyAmount" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="py-method" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Método</label>
            <Select id="py-method" v-model="pyMethod" :options="PAY_METHODS" option-label="label" option-value="value" fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Empleado</label>
          <Select v-model="pyEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Elige un empleado" size="small" fluid />
        </div>
        <p v-if="pyError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ pyError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="showPay = false" />
        <Button label="Registrar pago" severity="contrast" size="small" :loading="pySaving" :disabled="!pyValid" @click="submitPay" />
      </template>
    </Dialog>

    <!-- ── Nueva orden modal ───────────────────────────────────────────────── -->
    <Dialog v-model:visible="showCreate" modal header="Nueva orden de compra" :style="{ width: '36rem' }" :breakpoints="{ '600px': '94vw' }">
      <div class="flex flex-col gap-4 pt-1">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Solicitud aprobada</label>
            <Select v-model="coRequestId" :options="approvedRequestOptions" option-label="label" option-value="value" placeholder="Elige una solicitud" fluid @change="onPickRequest" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Proveedor</label>
            <Select v-model="coSupplier" :options="supplierPickerOptions" option-label="label" option-value="value" placeholder="Proveedor" fluid @change="prefillPrices" />
          </div>
        </div>
        <p v-if="!coLines.length" class="text-sm text-steel-500">Elige una solicitud aprobada para cargar sus ítems.</p>
        <div v-else class="flex flex-col gap-2">
          <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Ítems</span>
          <div v-for="line in coLines" :key="line.ingredient_id" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ purchasing.ingredientLabel(line.ingredient_id) }}</span>
            <InputNumber v-model="line.ordered_quantity" :min="0" :max-fraction-digits="3" placeholder="Cant." class="w-24" />
            <InputNumber v-model="line.unit_price" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" placeholder="Precio" class="w-32" />
          </div>
        </div>
        <p v-if="coError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ coError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="showCreate = false" />
        <Button label="Crear orden" size="small" :loading="coSaving" :disabled="!coValid" @click="submitCreate" />
      </template>
    </Dialog>
  </div>
</template>
