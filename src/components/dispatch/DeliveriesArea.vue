<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useDispatchStore } from '@/stores/dispatch'
import { statusOf } from '@/lib/apiError'
import type { Delivery } from '@/services/delivery.api'

const props = defineProps<{
  orderLabel: (orderId: string) => string
  routeName: (routeId: string | null) => string
  openOrderOptions: { label: string; value: string }[]
  canManage: boolean
  canAssign: boolean
}>()

const dispatch = useDispatchStore()

const STATUS: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignado',
  in_transit: 'En camino',
  delivered: 'Entregado',
  not_delivered: 'No entregado',
}
const statusFilter = ref<string>('all')
const statusOptions = [
  { label: 'Todos', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Asignados', value: 'assigned' },
  { label: 'En camino', value: 'in_transit' },
  { label: 'Entregados', value: 'delivered' },
  { label: 'No entregados', value: 'not_delivered' },
]

const visible = computed<Delivery[]>(() =>
  statusFilter.value === 'all'
    ? dispatch.deliveries
    : dispatch.deliveriesByStatus(statusFilter.value),
)

const selectedId = computed(() => dispatch.selectedDeliveryId)
const selected = computed(() => dispatch.selectedDelivery)
function select(d: Delivery) {
  dispatch.selectedDeliveryId = d.id
}

// Runs a pending delivery can be assigned to (preparing), labelled by route.
const runOptions = computed(() =>
  dispatch.preparingRuns.map((r) => ({ label: props.routeName(r.delivery_route_id), value: r.id })),
)

// --- Assign to run ---------------------------------------------------------
const assignRun = ref<string | null>(null)
const assigning = ref(false)
const assignError = ref<string | null>(null)

async function assign() {
  if (!selected.value || assignRun.value === null) return
  assigning.value = true
  assignError.value = null
  try {
    await dispatch.assignDelivery(selected.value.id, assignRun.value)
    assignRun.value = null
  } catch (e) {
    assignError.value =
      statusOf(e) === 409 ? 'El despacho ya salió o no admite asignaciones.' : 'No se pudo asignar.'
  } finally {
    assigning.value = false
  }
}

// --- Mark delivered / not delivered ----------------------------------------
const marking = ref(false)
const markError = ref<string | null>(null)
async function mark(delivered: boolean) {
  if (!selected.value) return
  marking.value = true
  markError.value = null
  try {
    await dispatch.markDelivered(selected.value.id, delivered)
  } catch (e) {
    markError.value =
      statusOf(e) === 409 ? 'El domicilio no está en camino.' : 'No se pudo actualizar.'
  } finally {
    marking.value = false
  }
}

// --- New delivery dialog ---------------------------------------------------
const showCreate = ref(false)
const fOrder = ref<string | null>(null)
const fAddress = ref('')
const fNeighborhood = ref('')
const saving = ref(false)
const formError = ref<string | null>(null)

function openCreate() {
  fOrder.value = null
  fAddress.value = ''
  fNeighborhood.value = ''
  formError.value = null
  showCreate.value = true
}
const canSubmit = computed(() => fOrder.value !== null && fAddress.value.trim() !== '')
async function submit() {
  if (!canSubmit.value || fOrder.value === null) return
  saving.value = true
  formError.value = null
  try {
    const delivery = await dispatch.createDelivery({
      order_id: fOrder.value,
      address_text: fAddress.value.trim(),
      neighborhood: fNeighborhood.value.trim() || null,
    })
    showCreate.value = false
    dispatch.selectedDeliveryId = delivery.id
  } catch (e) {
    formError.value =
      statusOf(e) === 409
        ? 'Ese pedido ya tiene un domicilio.'
        : statusOf(e) === 404
          ? 'El pedido no existe.'
          : 'No se pudo crear el domicilio.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value" class="w-44" />
      <Button v-if="canManage" label="Nuevo domicilio" size="small" icon="pi pi-plus" :disabled="!openOrderOptions.length" @click="openCreate" />
    </div>

    <div class="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-6">
      <!-- LIST -->
      <aside class="flex flex-col gap-1.5" :class="selectedId ? 'max-lg:hidden' : ''">
        <p v-if="!visible.length" class="text-steel-500">No hay domicilios.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="d in visible" :key="d.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="selectedId === d.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="select(d)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">{{ d.address_text }}</span>
                <span class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ orderLabel(d.order_id) }}
                </span>
              </span>
              <span class="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide bg-steel-500/10 text-steel-500">
                {{ STATUS[d.delivery_status] ?? d.delivery_status }}
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="selectedId ? '' : 'max-lg:hidden'">
        <div v-if="!selected" class="grid h-40 place-items-center px-6 text-center text-steel-500">
          Elige un domicilio para ver su detalle.
        </div>
        <div v-else class="p-4 sm:p-5">
          <button
            type="button"
            class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
            @click="dispatch.selectedDeliveryId = null"
          >
            <i class="pi pi-angle-left" /> Volver
          </button>

          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-ink">{{ selected.address_text }}</h3>
            <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
              {{ STATUS[selected.delivery_status] ?? selected.delivery_status }}
            </span>
          </div>
          <dl class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Barrio</dt>
              <dd class="text-ink">{{ selected.neighborhood || '—' }}</dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Pedido</dt>
              <dd class="text-ink">{{ orderLabel(selected.order_id) }}</dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Ruta</dt>
              <dd class="text-ink">{{ routeName(selected.delivery_route_id) }}</dd>
            </div>
          </dl>

          <!-- Assign (pending) -->
          <div v-if="canAssign && selected.delivery_status === 'pending'" class="mt-4 flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wide text-steel-500">Asignar a despacho</label>
            <div class="flex flex-wrap items-center gap-2">
              <Select v-model="assignRun" :options="runOptions" option-label="label" option-value="value" placeholder="Despacho (preparando)" class="w-56" />
              <Button label="Asignar" size="small" icon="pi pi-link" :loading="assigning" :disabled="assignRun === null" @click="assign" />
            </div>
            <p v-if="!runOptions.length" class="font-mono text-[11px] text-steel-500">No hay despachos en preparación. Crea uno en la pestaña Despachos.</p>
            <p v-if="assignError" role="alert" class="font-mono text-xs text-alert">{{ assignError }}</p>
          </div>

          <!-- Mark delivered / not (in_transit) -->
          <div v-if="canAssign && selected.delivery_status === 'in_transit'" class="mt-4 flex flex-wrap items-center gap-2">
            <Button label="Entregado" size="small" icon="pi pi-check" :loading="marking" @click="mark(true)" />
            <Button label="No entregado" size="small" severity="secondary" text icon="pi pi-times" :loading="marking" @click="mark(false)" />
            <p v-if="markError" role="alert" class="w-full font-mono text-xs text-alert">{{ markError }}</p>
          </div>
        </div>
      </section>
    </div>

    <!-- New delivery dialog -->
    <Dialog v-model:visible="showCreate" modal header="Nuevo domicilio" :style="{ width: '28rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="d-order" class="text-xs font-medium uppercase tracking-wide text-steel-500">Pedido</label>
          <Select id="d-order" v-model="fOrder" :options="openOrderOptions" option-label="label" option-value="value" placeholder="Elige un pedido abierto" filter fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="d-addr" class="text-xs font-medium uppercase tracking-wide text-steel-500">Dirección</label>
          <InputText id="d-addr" v-model="fAddress" fluid autofocus maxlength="255" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="d-nb" class="text-xs font-medium uppercase tracking-wide text-steel-500">Barrio (opcional)</label>
          <InputText id="d-nb" v-model="fNeighborhood" fluid maxlength="120" />
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
