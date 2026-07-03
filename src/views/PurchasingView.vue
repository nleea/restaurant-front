<script setup lang="ts">
// Compras — the unified purchasing board. El Pase board host: header + pill area tabs
// (Órdenes / Solicitudes / Proveedores), branch-scoped load on activation. Órdenes is the spine
// (orders carry the receipt-progress bar and the money signal); Solicitudes feed orders and
// Proveedores is the supplier catalog, embedded unchanged. Two stores sit behind one screen:
// procurement (branch-scoped requests/orders/payments) and purchasing (tenant-scoped suppliers).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useProcurementStore } from '@/stores/procurement'
import { usePurchasingStore } from '@/stores/purchasing'
import { useStaffStore } from '@/stores/staff'
import OrdersBoard from '@/components/purchasing/OrdersBoard.vue'
import RequestsBoard from '@/components/purchasing/RequestsBoard.vue'
import SuppliersPanel from '@/components/purchasing/SuppliersPanel.vue'

const auth = useAuthStore()
const branch = useBranchStore()
const procurement = useProcurementStore()
const purchasing = usePurchasingStore()
const staff = useStaffStore()

const canManage = computed(() => auth.can('purchasing.manage'))
const canApprove = computed(() => auth.can('purchasing.approve'))

type Area = 'orders' | 'requests' | 'suppliers'
const area = ref<Area>('orders')
const areas: { value: Area; label: string }[] = [
  { value: 'orders', label: 'Órdenes' },
  { value: 'requests', label: 'Solicitudes' },
  { value: 'suppliers', label: 'Proveedores' },
]

const loading = ref(false)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (!branch.activeBranchId) return
    await Promise.all([
      procurement.loadRequests(),
      procurement.loadOrders(),
      purchasing.loadSuppliers(),
      purchasing.loadDirectory(),
      staff.ensureLoaded({ branchId: branch.activeBranchId, active: true }),
    ])
  } catch {
    error.value = 'No se pudo cargar Compras.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(
  () => branch.activeBranchId,
  () => {
    procurement.selectedOrderId = null
    procurement.selectedRequestId = null
    void load()
  },
)
async function refresh() {
  refreshing.value = true
  try {
    await load()
  } finally {
    refreshing.value = false
  }
}

// Crear orden desde una solicitud aprobada: switch to Órdenes and open its create modal preset.
const ordersBoard = ref<InstanceType<typeof OrdersBoard> | null>(null)
async function onCreateOrder(requestId: string) {
  area.value = 'orders'
  await nextTick()
  await ordersBoard.value?.openCreate(requestId)
}
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-[90rem] flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- Top bar -->
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <p class="eyebrow">Estación · Compras</p>
            <h1 class="mt-1 text-2xl font-extrabold text-ink">Compras</h1>
            <p class="text-steel-500">Órdenes, solicitudes y proveedores de tu restaurante.</p>
          </div>
          <Button
            label="Actualizar"
            size="small"
            severity="secondary"
            outlined
            icon="pi pi-refresh"
            :loading="refreshing"
            :disabled="!branch.hasActiveBranch"
            @click="refresh"
          />
        </header>

        <!-- Área tabs -->
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

        <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ error }}
        </p>
        <p
          v-else-if="!branch.hasActiveBranch && !loading"
          class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500"
        >
          Esta cuenta aún no tiene sucursales.
        </p>
        <div v-if="loading && !procurement.orders.length" class="text-steel-500">Cargando Compras…</div>

        <template v-else-if="branch.hasActiveBranch">
          <OrdersBoard v-show="area === 'orders'" ref="ordersBoard" :can-manage="canManage" />
          <RequestsBoard
            v-if="area === 'requests'"
            :can-manage="canManage"
            :can-approve="canApprove"
            @create-order="onCreateOrder"
          />
          <SuppliersPanel v-if="area === 'suppliers'" />
        </template>
      </div>
    </main>
  </AppShell>
</template>
