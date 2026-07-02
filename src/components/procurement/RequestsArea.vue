<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useProcurementStore } from '@/stores/procurement'
import { usePurchasingStore } from '@/stores/purchasing'
import { useCatalogStore } from '@/stores/catalog'
import { useBranchStore } from '@/stores/branch'
import { formatQuantity } from '@/lib/quantity'
import { statusOf } from '@/lib/apiError'
import type { PurchaseRequest } from '@/services/purchasing.api'

const props = defineProps<{
  employeeOptions: { label: string; value: string }[]
  ingredientOptions: { label: string; value: string }[]
  canManage: boolean
  canApprove: boolean
}>()

const procurement = useProcurementStore()
const purchasing = usePurchasingStore()
const catalog = useCatalogStore()
const branch = useBranchStore()

const STATUS_LABELS: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }
const statusFilter = ref<string>('all')
const statusOptions = [
  { label: 'Todas', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Aprobadas', value: 'approved' },
  { label: 'Rechazadas', value: 'rejected' },
]

const unitOptions = computed(() =>
  catalog.units.map((u) => ({ label: `${u.name} (${u.abbreviation})`, value: u.id })),
)
function unitAbbr(unitId: string): string {
  return catalog.units.find((u) => u.id === unitId)?.abbreviation ?? ''
}
function employeeName(employeeId: string): string {
  return props.employeeOptions.find((o) => o.value === employeeId)?.label ?? '—'
}

const visibleRequests = computed<PurchaseRequest[]>(() =>
  statusFilter.value === 'all'
    ? procurement.branchRequests
    : procurement.branchRequests.filter((r) => r.status === statusFilter.value),
)

const selectedId = computed(() => procurement.selectedRequestId)
function select(request: PurchaseRequest) {
  void procurement.selectRequest(request.id)
}

// --- Resolve (approve / reject) --------------------------------------------
const resolveEmployee = ref<string | null>(null)
const resolving = ref(false)
const resolveError = ref<string | null>(null)

async function resolve(action: 'approve' | 'reject') {
  const request = procurement.selectedRequest
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

// --- New request dialog ----------------------------------------------------
interface LineDraft { ingredient_id: string | null; quantity: number | null; unit_of_measure_id: string | null }
const showCreate = ref(false)
const fEmployee = ref<string | null>(null)
const fReason = ref('')
const fLines = ref<LineDraft[]>([])
const saving = ref(false)
const formError = ref<string | null>(null)

function openCreate() {
  fEmployee.value = null
  fReason.value = ''
  fLines.value = [{ ingredient_id: null, quantity: null, unit_of_measure_id: null }]
  formError.value = null
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
    showCreate.value = false
    await procurement.selectRequest(request.id)
  } catch (e) {
    formError.value =
      statusOf(e) === 422 ? 'Datos inválidos: revisa las cantidades.' : 'No se pudo crear la solicitud.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value" class="w-44" />
      <Button v-if="canManage" label="Nueva solicitud" size="small" icon="pi pi-plus" @click="openCreate" />
    </div>

    <div class="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-6">
      <!-- LIST -->
      <aside class="flex flex-col gap-1.5" :class="selectedId ? 'max-lg:hidden' : ''">
        <p v-if="!visibleRequests.length" class="text-steel-500">No hay solicitudes.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="req in visibleRequests" :key="req.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="selectedId === req.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="select(req)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">
                  {{ req.reason || 'Solicitud' }}
                </span>
                <span class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ employeeName(req.requested_by_employee_id) }}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <span
                  class="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide"
                  :class="req.status === 'pending' ? 'bg-ember/10 text-ember' : req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-steel-500/10 text-steel-500'"
                >
                  {{ STATUS_LABELS[req.status] ?? req.status }}
                </span>
                <span class="text-steel-500 lg:hidden" aria-hidden="true"><i class="pi pi-angle-right" /></span>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="selectedId ? '' : 'max-lg:hidden'">
        <div v-if="!procurement.selectedRequest" class="grid h-40 place-items-center px-6 text-center text-steel-500">
          Elige una solicitud para ver su detalle.
        </div>
        <div v-else class="p-4 sm:p-5">
          <button
            type="button"
            class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
            @click="procurement.selectedRequestId = null"
          >
            <i class="pi pi-angle-left" /> Volver
          </button>

          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-ink">{{ procurement.selectedRequest.reason || 'Solicitud' }}</h3>
            <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
              {{ STATUS_LABELS[procurement.selectedRequest.status] ?? procurement.selectedRequest.status }}
            </span>
          </div>

          <ul class="mt-3 divide-y divide-line rounded-lg border border-line bg-app">
            <li
              v-for="item in procurement.itemsOfRequest(procurement.selectedRequest.id)"
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
          <div v-if="canApprove && procurement.selectedRequest.status === 'pending'" class="mt-4 flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wide text-steel-500">Resolver como</label>
            <div class="flex flex-wrap items-center gap-2">
              <Select v-model="resolveEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" class="w-48" />
              <Button label="Aprobar" size="small" icon="pi pi-check" :loading="resolving" :disabled="!resolveEmployee" @click="resolve('approve')" />
              <Button label="Rechazar" size="small" severity="secondary" text icon="pi pi-times" :loading="resolving" :disabled="!resolveEmployee" @click="resolve('reject')" />
            </div>
            <p v-if="resolveError" role="alert" class="font-mono text-xs text-alert">{{ resolveError }}</p>
          </div>
        </div>
      </section>
    </div>

    <!-- New request dialog -->
    <Dialog v-model:visible="showCreate" modal header="Nueva solicitud" :style="{ width: '34rem' }" :breakpoints="{ '560px': '94vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="rq-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">Solicita</label>
            <Select id="rq-emp" v-model="fEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="rq-reason" class="text-xs font-medium uppercase tracking-wide text-steel-500">Motivo (opcional)</label>
            <InputText id="rq-reason" v-model="fReason" fluid maxlength="255" />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-steel-500">Ítems</span>
          <div v-for="(line, i) in fLines" :key="i" class="flex items-center gap-2">
            <Select v-model="line.ingredient_id" :options="ingredientOptions" option-label="label" option-value="value" placeholder="Ingrediente" filter class="min-w-0 flex-1" />
            <InputNumber v-model="line.quantity" :min="0" :max-fraction-digits="3" placeholder="Cant." class="w-24" />
            <Select v-model="line.unit_of_measure_id" :options="unitOptions" option-label="label" option-value="value" placeholder="Unidad" class="w-32" />
            <button
              type="button"
              class="grid size-8 shrink-0 place-items-center rounded-md text-steel-500 transition hover:bg-alert/10 hover:text-alert"
              :disabled="fLines.length === 1"
              aria-label="Quitar ítem"
              @click="removeLine(i)"
            >
              <i class="pi pi-trash text-xs" />
            </button>
          </div>
          <Button label="Agregar ítem" size="small" severity="secondary" text icon="pi pi-plus" class="w-fit" @click="addLine" />
        </div>

        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showCreate = false" />
        <Button label="Crear solicitud" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
