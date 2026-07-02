<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import { useDispatchStore } from '@/stores/dispatch'
import { listDrivers } from '@/services/delivery.api'
import { statusOf } from '@/lib/apiError'
import type { Run } from '@/services/delivery.api'

const props = defineProps<{
  routeName: (routeId: string | null) => string
  driverName: (employeeId: string) => string
  orderLabel: (orderId: string) => string
  routeOptions: { label: string; value: string }[]
  canManage: boolean
  canAssign: boolean
}>()

const dispatch = useDispatchStore()

const STATUS: Record<string, string> = {
  preparing: 'Preparando',
  in_transit: 'En camino',
  finished: 'Finalizado',
}
const DELIVERY_STATUS: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignado',
  in_transit: 'En camino',
  delivered: 'Entregado',
  not_delivered: 'No entregado',
}
const statusFilter = ref<string>('all')
const statusOptions = [
  { label: 'Todos', value: 'all' },
  { label: 'Preparando', value: 'preparing' },
  { label: 'En camino', value: 'in_transit' },
  { label: 'Finalizados', value: 'finished' },
]

const visible = computed<Run[]>(() =>
  statusFilter.value === 'all' ? dispatch.runs : dispatch.runsByStatus(statusFilter.value),
)

const selectedId = computed(() => dispatch.selectedRunId)
const selected = computed(() => dispatch.selectedRun)
function select(r: Run) {
  dispatch.selectedRunId = r.id
}

// --- Lifecycle: depart / finish --------------------------------------------
const advancing = ref(false)
const lifecycleError = ref<string | null>(null)
async function depart() {
  if (!selected.value) return
  advancing.value = true
  lifecycleError.value = null
  try {
    await dispatch.departRun(selected.value.id)
  } catch (e) {
    lifecycleError.value = statusOf(e) === 409 ? 'El despacho no está en preparación.' : 'No se pudo dar salida.'
  } finally {
    advancing.value = false
  }
}
async function finish() {
  if (!selected.value) return
  advancing.value = true
  lifecycleError.value = null
  try {
    await dispatch.finishRun(selected.value.id)
  } catch (e) {
    lifecycleError.value = statusOf(e) === 409 ? 'El despacho no está en camino.' : 'No se pudo finalizar.'
  } finally {
    advancing.value = false
  }
}

// --- New run dialog --------------------------------------------------------
const showCreate = ref(false)
const fRoute = ref<string | null>(null)
const fDriver = ref<string | null>(null)
const driverOptions = ref<{ label: string; value: string }[]>([])
const loadingDrivers = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)

function openCreate() {
  fRoute.value = null
  fDriver.value = null
  driverOptions.value = []
  formError.value = null
  showCreate.value = true
}

// When a route is chosen, load its drivers (the run's driver must be a driver of the route).
async function onPickRoute() {
  fDriver.value = null
  driverOptions.value = []
  if (!fRoute.value) return
  loadingDrivers.value = true
  try {
    const drivers = await listDrivers(fRoute.value)
    driverOptions.value = drivers
      .filter((d) => d.is_active)
      .map((d) => ({ label: props.driverName(d.employee_id), value: d.employee_id }))
  } finally {
    loadingDrivers.value = false
  }
}

const canSubmit = computed(() => fRoute.value !== null && fDriver.value !== null)
async function submit() {
  if (!canSubmit.value || fRoute.value === null || fDriver.value === null) return
  saving.value = true
  formError.value = null
  try {
    const run = await dispatch.createRun({ delivery_route_id: fRoute.value, employee_id: fDriver.value })
    showCreate.value = false
    dispatch.selectedRunId = run.id
  } catch (e) {
    formError.value =
      statusOf(e) === 404 || statusOf(e) === 422
        ? 'El conductor no está asignado a esa ruta.'
        : 'No se pudo crear el despacho.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value" class="w-44" />
      <Button v-if="canManage" label="Nuevo despacho" size="small" icon="pi pi-plus" :disabled="!routeOptions.length" @click="openCreate" />
    </div>

    <div class="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-6">
      <!-- LIST -->
      <aside class="flex flex-col gap-1.5" :class="selectedId ? 'max-lg:hidden' : ''">
        <p v-if="!visible.length" class="text-steel-500">No hay despachos.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="r in visible" :key="r.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="selectedId === r.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="select(r)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">{{ routeName(r.delivery_route_id) }}</span>
                <span class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ driverName(r.employee_id) }}
                </span>
              </span>
              <span class="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide bg-steel-500/10 text-steel-500">
                {{ STATUS[r.status] ?? r.status }}
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="selectedId ? '' : 'max-lg:hidden'">
        <div v-if="!selected" class="grid h-40 place-items-center px-6 text-center text-steel-500">
          Elige un despacho para ver su detalle.
        </div>
        <div v-else class="p-4 sm:p-5">
          <button
            type="button"
            class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
            @click="dispatch.selectedRunId = null"
          >
            <i class="pi pi-angle-left" /> Volver
          </button>

          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-ink">{{ routeName(selected.delivery_route_id) }}</h3>
              <p class="font-mono text-[11px] text-steel-500">Conductor: {{ driverName(selected.employee_id) }}</p>
            </div>
            <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ STATUS[selected.status] ?? selected.status }}</span>
          </div>

          <!-- Lifecycle -->
          <div v-if="canAssign" class="mt-4 flex flex-wrap items-center gap-2">
            <Button v-if="selected.status === 'preparing'" label="Salir" size="small" icon="pi pi-send" :loading="advancing" @click="depart" />
            <Button v-if="selected.status === 'in_transit'" label="Finalizar" size="small" severity="contrast" icon="pi pi-flag" :loading="advancing" @click="finish" />
            <p v-if="lifecycleError" role="alert" class="w-full font-mono text-xs text-alert">{{ lifecycleError }}</p>
          </div>

          <!-- Its deliveries -->
          <h4 class="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Domicilios del despacho</h4>
          <p v-if="!dispatch.deliveriesOfRun(selected.id).length" class="mt-2 text-sm text-steel-500">Sin domicilios asignados.</p>
          <ul v-else class="mt-2 divide-y divide-line rounded-lg border border-line bg-app">
            <li v-for="d in dispatch.deliveriesOfRun(selected.id)" :key="d.id" class="flex items-center justify-between gap-3 px-3 py-2">
              <span class="min-w-0">
                <span class="block truncate text-sm text-ink">{{ d.address_text }}</span>
                <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ orderLabel(d.order_id) }}</span>
              </span>
              <span class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ DELIVERY_STATUS[d.delivery_status] ?? d.delivery_status }}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <!-- New run dialog -->
    <Dialog v-model:visible="showCreate" modal header="Nuevo despacho" :style="{ width: '26rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="r-route" class="text-xs font-medium uppercase tracking-wide text-steel-500">Ruta</label>
          <Select id="r-route" v-model="fRoute" :options="routeOptions" option-label="label" option-value="value" placeholder="Elige una ruta" fluid @change="onPickRoute" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="r-driver" class="text-xs font-medium uppercase tracking-wide text-steel-500">Conductor</label>
          <Select id="r-driver" v-model="fDriver" :options="driverOptions" option-label="label" option-value="value" :placeholder="loadingDrivers ? 'Cargando…' : 'Elige un conductor'" :disabled="!fRoute || loadingDrivers" fluid />
          <p v-if="fRoute && !loadingDrivers && !driverOptions.length" class="font-mono text-[11px] text-steel-500">
            Esa ruta no tiene conductores. Asigna uno en Domicilios → Rutas.
          </p>
        </div>
        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showCreate = false" />
        <Button label="Crear" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
