<script setup lang="ts">
// Solicitudes — the Compras board's requests area. Purchase requests bucketed by status
// (pendiente/aprobada/rechazada), with a slide-in detail drawer for the selected request: its
// items, plus gated actions — aprobar/rechazar (`purchasing.approve`) and "crear orden desde
// aprobada" (handed up to the Órdenes area). Nueva solicitud is gated `purchasing.manage` and can
// optionally approve on creation — a real two-write flow with partial-success copy.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useProcurementStore } from '@/stores/procurement'
import { usePurchasingStore } from '@/stores/purchasing'
import { useCatalogStore } from '@/stores/catalog'
import { useBranchStore } from '@/stores/branch'
import { useStaffStore } from '@/stores/staff'
import { formatQuantity } from '@/lib/quantity'
import { statusOf } from '@/lib/apiError'
import type { PurchaseRequest } from '@/services/purchasing.api'

const props = defineProps<{ canManage: boolean; canApprove: boolean }>()
const emit = defineEmits<{ (e: 'create-order', requestId: string): void }>()

const procurement = useProcurementStore()
const purchasing = usePurchasingStore()
const catalog = useCatalogStore()
const branch = useBranchStore()
const staff = useStaffStore()

const REQUEST_META: Record<string, { label: string; pill: string }> = {
  pending: { label: 'Pendiente', pill: 'pill-warn' },
  approved: { label: 'Aprobada', pill: 'pill-success' },
  rejected: { label: 'Rechazada', pill: 'pill-neutral' },
}

const employeeOptions = computed(() =>
  staff.employees
    .filter((e) => e.is_active)
    .map((e) => ({ label: staff.employeeName(e), value: e.id })),
)
const ingredientOptions = computed(() =>
  Object.entries(purchasing.ingredientIndex).map(([id, info]) => ({ label: info.name, value: id })),
)
const unitOptions = computed(() =>
  catalog.units.map((u) => ({ label: `${u.name} (${u.abbreviation})`, value: u.id })),
)
function unitAbbr(unitId: string): string {
  return catalog.units.find((u) => u.id === unitId)?.abbreviation ?? ''
}
function employeeName(id: string): string {
  return employeeOptions.value.find((o) => o.value === id)?.label ?? '—'
}

const buckets = computed(() => ({
  pending: procurement.branchRequests.filter((r) => r.status === 'pending'),
  approved: procurement.branchRequests.filter((r) => r.status === 'approved'),
  rejected: procurement.branchRequests.filter((r) => r.status === 'rejected'),
}))
const BUCKETS: { key: 'pending' | 'approved' | 'rejected'; title: string }[] = [
  { key: 'pending', title: 'Pendientes' },
  { key: 'approved', title: 'Aprobadas' },
  { key: 'rejected', title: 'Rechazadas' },
]

// --- Detail drawer ------------------------------------------------------------------------
const openId = ref<string | null>(null)
const openRequest = computed(
  () => procurement.branchRequests.find((r) => r.id === openId.value) ?? null,
)
async function openDetail(request: PurchaseRequest) {
  openId.value = request.id
  resolveEmployee.value = null
  resolveError.value = null
  await procurement.selectRequest(request.id)
}
function closeDrawer() {
  openId.value = null
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && openId.value) closeDrawer()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// --- Approve / reject ---------------------------------------------------------------------
const resolveEmployee = ref<string | null>(null)
const resolving = ref(false)
const resolveError = ref<string | null>(null)
async function resolve(action: 'approve' | 'reject') {
  const request = openRequest.value
  if (!request || resolveEmployee.value === null) return
  resolving.value = true
  resolveError.value = null
  try {
    if (action === 'approve') await procurement.approveRequest(request.id, resolveEmployee.value)
    else await procurement.rejectRequest(request.id, resolveEmployee.value)
    resolveEmployee.value = null
  } catch (e) {
    resolveError.value =
      statusOf(e) === 409 ? 'La solicitud ya fue resuelta.' : 'No se pudo resolver la solicitud.'
  } finally {
    resolving.value = false
  }
}

function requestCreateOrder(request: PurchaseRequest) {
  emit('create-order', request.id)
}

// --- Nueva solicitud dialog ---------------------------------------------------------------
interface LineDraft {
  ingredient_id: string | null
  quantity: number | null
  unit_of_measure_id: string | null
}
const showCreate = ref(false)
const fEmployee = ref<string | null>(null)
const fReason = ref('')
const fLines = ref<LineDraft[]>([])
const fApproveNow = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)
const formPartial = ref<string | null>(null)

function openCreate() {
  fEmployee.value = null
  fReason.value = ''
  fLines.value = [{ ingredient_id: null, quantity: null, unit_of_measure_id: null }]
  fApproveNow.value = false
  formError.value = null
  formPartial.value = null
  showCreate.value = true
}
function addLine() {
  fLines.value.push({ ingredient_id: null, quantity: null, unit_of_measure_id: null })
}
function removeLine(index: number) {
  fLines.value.splice(index, 1)
}
const validLines = computed(() =>
  fLines.value.filter(
    (l) => l.ingredient_id && l.unit_of_measure_id && l.quantity !== null && l.quantity > 0,
  ),
)
const canSubmit = computed(() => fEmployee.value !== null && validLines.value.length > 0)

async function submit() {
  if (!canSubmit.value || fEmployee.value === null || !branch.activeBranchId) return
  saving.value = true
  formError.value = null
  formPartial.value = null
  try {
    const request = await procurement.createRequest({
      branch_id: branch.activeBranchId,
      requested_by_employee_id: fEmployee.value,
      reason: fReason.value.trim() || null,
      items: validLines.value.map((l) => ({
        ingredient_id: l.ingredient_id as string,
        requested_quantity: String(l.quantity),
        unit_of_measure_id: l.unit_of_measure_id as string,
      })),
    })
    // Two-write flow: if the creator chose to approve now, the approve is a separate call. On a
    // mid-flow failure we keep the created request and surface what remains (decision 6).
    if (fApproveNow.value && props.canApprove) {
      try {
        await procurement.approveRequest(request.id, fEmployee.value)
      } catch {
        formPartial.value = 'La solicitud quedó creada, pero falta aprobarla — hazlo desde su detalle.'
        await openDetail(request)
        return
      }
    }
    showCreate.value = false
    await openDetail(request)
  } catch (e) {
    formError.value =
      statusOf(e) === 422 ? 'Datos inválidos: revisa las cantidades.' : 'No se pudo crear la solicitud.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-end">
      <Button v-if="props.canManage" label="Nueva solicitud" size="small" icon="pi pi-plus" @click="openCreate" />
    </div>

    <!-- Buckets -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section v-for="bucket in BUCKETS" :key="bucket.key" class="flex flex-col gap-2">
        <h2 class="eyebrow">{{ bucket.title }} · {{ buckets[bucket.key].length }}</h2>
        <p v-if="!buckets[bucket.key].length" class="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
          Nada por aquí.
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="req in buckets[bucket.key]" :key="req.id">
            <button
              type="button"
              class="card flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:border-steel-400"
              :class="openId === req.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="openDetail(req)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">{{ req.reason || 'Solicitud' }}</span>
                <span class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ employeeName(req.requested_by_employee_id) }}
                </span>
              </span>
              <span class="pill shrink-0" :class="REQUEST_META[req.status]?.pill ?? 'pill-neutral'">
                {{ REQUEST_META[req.status]?.label ?? req.status }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <!-- ── Request detail drawer ───────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="openRequest" class="fixed inset-0 z-40 bg-graphite-900/30" @click="closeDrawer" />
      <Transition name="detail">
        <aside
          v-if="openRequest"
          class="fixed inset-y-0 right-0 z-50 flex w-full max-w-[26rem] flex-col border-l border-line bg-paper shadow-2xl"
        >
          <div class="border-b border-hairline p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="truncate font-display text-xl font-bold text-ink">{{ openRequest.reason || 'Solicitud' }}</h2>
                <p class="font-mono text-[11px] text-steel-500">{{ employeeName(openRequest.requested_by_employee_id) }}</p>
              </div>
              <Button icon="pi pi-times" size="small" severity="secondary" text aria-label="Cerrar" @click="closeDrawer" />
            </div>
            <div class="mt-2">
              <span class="pill" :class="REQUEST_META[openRequest.status]?.pill ?? 'pill-neutral'">
                {{ REQUEST_META[openRequest.status]?.label ?? openRequest.status }}
              </span>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <h3 class="eyebrow">Ítems</h3>
            <ul class="mt-2 divide-y divide-line rounded-lg border border-line bg-app">
              <li
                v-for="item in procurement.itemsOfRequest(openRequest.id)"
                :key="item.id"
                class="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span class="truncate text-sm text-ink">{{ purchasing.ingredientLabel(item.ingredient_id) }}</span>
                <span class="shrink-0 font-mono text-sm text-ink">
                  {{ formatQuantity(item.requested_quantity, unitAbbr(item.unit_of_measure_id)) }}
                </span>
              </li>
            </ul>

            <!-- Approve / reject (pending only) -->
            <div v-if="props.canApprove && openRequest.status === 'pending'" class="mt-5 flex flex-col gap-2">
              <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Resolver como</label>
              <Select v-model="resolveEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" size="small" fluid />
              <div class="flex items-center gap-2">
                <Button label="Aprobar" size="small" icon="pi pi-check" :loading="resolving" :disabled="!resolveEmployee" @click="resolve('approve')" />
                <Button label="Rechazar" size="small" severity="secondary" text icon="pi pi-times" :loading="resolving" :disabled="!resolveEmployee" @click="resolve('reject')" />
              </div>
              <p v-if="resolveError" role="alert" class="font-mono text-xs text-alert">{{ resolveError }}</p>
            </div>
          </div>

          <!-- Footer: crear orden desde aprobada -->
          <div v-if="props.canManage && openRequest.status === 'approved'" class="border-t border-hairline p-4">
            <Button label="Crear orden" icon="pi pi-plus" size="small" class="w-full" @click="requestCreateOrder(openRequest)" />
          </div>
        </aside>
      </Transition>
    </Teleport>

    <!-- ── Nueva solicitud dialog ──────────────────────────────────────────── -->
    <Dialog v-model:visible="showCreate" modal header="Nueva solicitud" :style="{ width: '34rem' }" :breakpoints="{ '560px': '94vw' }">
      <div class="flex flex-col gap-4 pt-1">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Solicita</label>
            <Select v-model="fEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Motivo (opcional)</label>
            <InputText v-model="fReason" fluid maxlength="255" />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Ítems</span>
          <div v-for="(line, i) in fLines" :key="i" class="flex items-center gap-2">
            <Select v-model="line.ingredient_id" :options="ingredientOptions" option-label="label" option-value="value" placeholder="Ingrediente" filter class="min-w-0 flex-1" />
            <InputNumber v-model="line.quantity" :min="0" :max-fraction-digits="3" placeholder="Cant." class="w-24" />
            <Select v-model="line.unit_of_measure_id" :options="unitOptions" option-label="label" option-value="value" placeholder="Unidad" class="w-32" />
            <button
              type="button"
              class="grid size-8 shrink-0 place-items-center rounded-md text-steel-500 transition hover:bg-alert/10 hover:text-alert disabled:opacity-40"
              :disabled="fLines.length === 1"
              aria-label="Quitar ítem"
              @click="removeLine(i)"
            >
              <i class="pi pi-trash text-xs" />
            </button>
          </div>
          <Button label="Agregar ítem" size="small" severity="secondary" text icon="pi pi-plus" class="w-fit" @click="addLine" />
        </div>

        <label v-if="props.canApprove" class="flex items-center gap-2 text-sm text-muted">
          <input v-model="fApproveNow" type="checkbox" class="accent-ember" />
          Aprobar de inmediato
        </label>

        <p v-if="formPartial" class="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn-600">
          {{ formPartial }}
        </p>
        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="showCreate = false" />
        <Button label="Crear solicitud" size="small" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
