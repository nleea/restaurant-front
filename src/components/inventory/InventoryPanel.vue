<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useInventoryStore } from '@/stores/inventory'
import { useStaffStore } from '@/stores/staff'
import { formatQuantity } from '@/lib/quantity'
import IngredientDetail from '@/components/inventory/IngredientDetail.vue'
import type { StockRow } from '@/stores/inventory'

// Orchestrates the inventory screen: loads the active branch's stock + ingredient labels + the
// staff directory (for the employee pickers), then renders the stock list (master) and the
// selected ingredient's detail. Mutations live in IngredientDetail via the inventory store.
const auth = useAuthStore()
const branch = useBranchStore()
const inv = useInventoryStore()
const staff = useStaffStore()

const canAdjust = computed(() => auth.can('inventory.adjust'))

const loading = ref(false)
const error = ref<string | null>(null)
const lowOnly = ref(false)
const selectedId = ref<string | null>(null)

const employeeOptions = computed(() =>
  staff.employees
    .filter((e) => e.is_active)
    .map((e) => ({ label: staff.employeeName(e), value: e.id })),
)

const visibleRows = computed<StockRow[]>(() => (lowOnly.value ? inv.lowRows : inv.rows))
const selectedRow = computed<StockRow | null>(
  () => inv.rows.find((r) => r.stock.ingredient_id === selectedId.value) ?? null,
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await Promise.all([
        inv.loadBranch(branch.activeBranchId),
        staff.ensureLoaded({ branchId: branch.activeBranchId, active: true }),
      ])
    }
  } catch {
    error.value = 'No se pudo cargar el inventario.'
  } finally {
    loading.value = false
  }
}

async function select(row: StockRow) {
  selectedId.value = row.stock.ingredient_id
  await inv.selectIngredient(row.stock.ingredient_id)
}

onMounted(load)
watch(
  () => branch.activeBranchId,
  () => {
    selectedId.value = null
    inv.selectedIngredientId = null
    inv.movements = []
    void load()
  },
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-end">
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

    <div v-if="loading" class="text-steel-500">Cargando el inventario…</div>

    <div v-else-if="branch.hasActiveBranch" class="lg:grid lg:grid-cols-[22rem_1fr] lg:gap-6">
      <!-- LIST (drill-down master) -->
      <aside class="flex flex-col gap-3" :class="selectedId ? 'max-lg:hidden' : ''">
        <label class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
          <ToggleSwitch v-model="lowOnly" />
          Solo bajo stock
        </label>

        <p v-if="!visibleRows.length" class="text-steel-500">
          {{ lowOnly ? 'Ningún ingrediente está bajo mínimo.' : 'No hay existencias registradas en esta sucursal.' }}
        </p>

        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="row in visibleRows" :key="row.stock.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="selectedId === row.stock.ingredient_id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="select(row)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">{{ row.name }}</span>
                <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  Mín {{ formatQuantity(row.stock.min_stock, row.unitAbbr) || '0' }}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <span
                  v-if="row.low"
                  class="rounded-full bg-alert/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-alert"
                >
                  Bajo
                </span>
                <span class="font-mono text-sm" :class="row.low ? 'text-alert' : 'text-ink'">
                  {{ formatQuantity(row.stock.current_quantity, row.unitAbbr) || '0' }}
                </span>
                <span class="text-steel-500 lg:hidden" aria-hidden="true">
                  <i class="pi pi-angle-right" />
                </span>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="selectedId ? '' : 'max-lg:hidden'">
        <div v-if="!selectedRow" class="grid h-48 place-items-center px-6 text-center text-steel-500">
          Elige un ingrediente para ver su detalle.
        </div>
        <Transition name="detail">
          <IngredientDetail
            v-if="selectedRow"
            :key="selectedRow.stock.ingredient_id"
            :row="selectedRow"
            :employee-options="employeeOptions"
            :can-adjust="canAdjust"
            @back="selectedId = null"
          />
        </Transition>
      </section>
    </div>
  </div>
</template>
