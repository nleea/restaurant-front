<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useDispatchStore } from '@/stores/dispatch'
import { useDeliveryStore } from '@/stores/delivery'
import { useStaffStore } from '@/stores/staff'
import { useOrdersStore } from '@/stores/orders'
import DeliveriesArea from '@/components/dispatch/DeliveriesArea.vue'
import RunsArea from '@/components/dispatch/RunsArea.vue'
import type { Employee } from '@/services/staff.api'

// Orchestrates the dispatch board: loads deliveries + runs, and ensures the delivery routes, staff,
// and open orders are loaded for labels and pickers. Two areas — Domicilios and Despachos — switch
// in place; mutations live in the areas via the dispatch store. Shared label/option helpers are
// computed here from the supporting stores and passed down.
const auth = useAuthStore()
const branch = useBranchStore()
const dispatch = useDispatchStore()
const delivery = useDeliveryStore()
const staff = useStaffStore()
const orders = useOrdersStore()

const canManage = computed(() => auth.can('delivery.manage'))
const canAssign = computed(() => auth.can('delivery.assign'))

type Area = 'deliveries' | 'runs'
const area = ref<Area>('deliveries')
const areas: { value: Area; label: string }[] = [
  { value: 'deliveries', label: 'Domicilios' },
  { value: 'runs', label: 'Despachos' },
]

const loading = ref(false)
const error = ref<string | null>(null)

const CHANNELS: Record<string, string> = {
  dine_in: 'Mesa',
  takeaway: 'Para llevar',
  delivery: 'Domicilio',
}

// --- Shared label/option helpers -------------------------------------------
function orderLabel(orderId: string): string {
  const order = orders.orders.find((o) => o.id === orderId)
  if (!order) return `#${orderId.slice(0, 8)}`
  if (order.dining_table_id) {
    const table = orders.tables.find((t) => t.id === order.dining_table_id)
    if (table) return `Mesa ${table.number}`
  }
  return CHANNELS[order.channel] ?? order.channel
}
function routeName(routeId: string | null): string {
  if (!routeId) return '—'
  return delivery.routes.find((r) => r.id === routeId)?.name ?? `#${routeId.slice(0, 8)}`
}
function driverName(employeeId: string): string {
  const emp = staff.employees.find((e: Employee) => e.id === employeeId)
  return emp ? staff.employeeName(emp) : `#${employeeId.slice(0, 8)}`
}

const openOrderOptions = computed(() =>
  orders.orders.map((o) => ({ label: `${orderLabel(o.id)} · #${o.id.slice(0, 8)}`, value: o.id })),
)
const routeOptions = computed(() =>
  delivery.activeRoutes.map((r) => ({ label: r.name, value: r.id })),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    const branchId = branch.activeBranchId ?? undefined
    await Promise.all([
      dispatch.loadDeliveries(),
      dispatch.loadRuns(),
      branchId ? delivery.loadRoutes(branchId) : Promise.resolve(),
      staff.ensureLoaded({ branchId, active: true }),
      branchId ? orders.loadOrders(branchId, 'open') : Promise.resolve(),
      branchId ? orders.loadTables(branchId) : Promise.resolve(),
    ])
  } catch {
    error.value = 'No se pudo cargar el despacho.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(
  () => branch.activeBranchId,
  () => {
    dispatch.selectedDeliveryId = null
    dispatch.selectedRunId = null
    void load()
  },
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-between gap-2">
      <nav class="flex w-fit gap-1 rounded-xl border border-line bg-app p-1">
        <button
          v-for="t in areas"
          :key="t.value"
          type="button"
          class="rounded-lg px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          :class="area === t.value ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
          @click="area = t.value"
        >
          {{ t.label }}
        </button>
      </nav>
      <Button label="Actualizar" size="small" severity="secondary" outlined icon="pi pi-refresh" :loading="loading" @click="load" />
    </div>

    <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>

    <div v-if="loading" class="text-steel-500">Cargando el despacho…</div>

    <template v-else>
      <DeliveriesArea
        v-if="area === 'deliveries'"
        :order-label="orderLabel"
        :route-name="routeName"
        :open-order-options="openOrderOptions"
        :can-manage="canManage"
        :can-assign="canAssign"
      />
      <RunsArea
        v-else
        :route-name="routeName"
        :driver-name="driverName"
        :order-label="orderLabel"
        :route-options="routeOptions"
        :can-manage="canManage"
        :can-assign="canAssign"
      />
    </template>
  </div>
</template>
