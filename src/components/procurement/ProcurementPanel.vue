<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useProcurementStore } from '@/stores/procurement'
import { usePurchasingStore } from '@/stores/purchasing'
import { useStaffStore } from '@/stores/staff'
import RequestsArea from '@/components/procurement/RequestsArea.vue'
import OrdersArea from '@/components/procurement/OrdersArea.vue'

// Orchestrates the procure-to-pay screen: loads the active branch's requests + orders, and ensures
// the supplier/ingredient/unit/employee directories (owned by other stores) are loaded for labels
// and pickers. Two areas — Solicitudes and Órdenes — switch in place; mutations live in the areas.
const auth = useAuthStore()
const branch = useBranchStore()
const procurement = useProcurementStore()
const purchasing = usePurchasingStore()
const staff = useStaffStore()

const canManage = computed(() => auth.can('purchasing.manage'))
const canApprove = computed(() => auth.can('purchasing.approve'))

type Area = 'requests' | 'orders'
const area = ref<Area>('requests')
const areas: { value: Area; label: string }[] = [
  { value: 'requests', label: 'Solicitudes' },
  { value: 'orders', label: 'Órdenes' },
]

const loading = ref(false)
const error = ref<string | null>(null)

// Pickers shared by both areas.
const employeeOptions = computed(() =>
  staff.employees.filter((e) => e.is_active).map((e) => ({ label: staff.employeeName(e), value: e.id })),
)
const ingredientOptions = computed(() =>
  Object.entries(purchasing.ingredientIndex).map(([id, info]) => ({ label: info.name, value: id })),
)
const supplierOptions = computed(() =>
  purchasing.activeSuppliers.map((s) => ({ label: s.name, value: s.id })),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await Promise.all([
        procurement.loadRequests(),
        procurement.loadOrders(),
        purchasing.loadSuppliers(),
        purchasing.loadDirectory(),
        staff.ensureLoaded({ branchId: branch.activeBranchId, active: true }),
      ])
    }
  } catch {
    error.value = 'No se pudo cargar el abastecimiento.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(
  () => branch.activeBranchId,
  () => {
    procurement.selectedRequestId = null
    procurement.selectedOrderId = null
    void load()
  },
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-between gap-2">
      <!-- Area switch -->
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
      <Button
        label="Actualizar"
        size="small"
        severity="secondary"
        outlined
        icon="pi pi-refresh"
        :loading="loading"
        :disabled="!branch.hasActiveBranch"
        @click="load"
      />
    </div>

    <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>
    <p
      v-else-if="!branch.hasActiveBranch && !loading"
      class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500"
    >
      Esta cuenta aún no tiene sucursales.
    </p>

    <div v-if="loading" class="text-steel-500">Cargando abastecimiento…</div>

    <template v-else-if="branch.hasActiveBranch">
      <RequestsArea
        v-if="area === 'requests'"
        :employee-options="employeeOptions"
        :ingredient-options="ingredientOptions"
        :can-manage="canManage"
        :can-approve="canApprove"
      />
      <OrdersArea
        v-else
        :employee-options="employeeOptions"
        :supplier-options="supplierOptions"
        :can-manage="canManage"
      />
    </template>
  </div>
</template>
