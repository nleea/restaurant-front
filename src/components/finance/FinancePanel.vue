<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useFinanceStore } from '@/stores/finance'
import { useStaffStore } from '@/stores/staff'
import ExpensesArea from '@/components/finance/ExpensesArea.vue'
import CategoriesArea from '@/components/finance/CategoriesArea.vue'

// Orchestrates the finance screen: loads the tenant's expense categories, the active branch's
// expenses, and the staff directory (for the record-expense employee picker). Two areas — Gastos
// and Categorías — switch in place; mutations live in the areas via the finance store.
const auth = useAuthStore()
const branch = useBranchStore()
const finance = useFinanceStore()
const staff = useStaffStore()

const canManage = computed(() => auth.can('finance.manage'))

type Area = 'expenses' | 'categories'
const area = ref<Area>('expenses')
const areas: { value: Area; label: string }[] = [
  { value: 'expenses', label: 'Gastos' },
  { value: 'categories', label: 'Categorías' },
]

const loading = ref(false)
const error = ref<string | null>(null)

const employeeOptions = computed(() =>
  staff.employees.filter((e) => e.is_active).map((e) => ({ label: staff.employeeName(e), value: e.id })),
)
const categoryOptions = computed(() =>
  finance.activeCategories.map((c) => ({ label: c.name, value: c.id })),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await Promise.all([
        finance.loadCategories(),
        finance.loadExpenses(branch.activeBranchId, finance.categoryFilter),
        staff.ensureLoaded({ branchId: branch.activeBranchId, active: true }),
      ])
    }
  } catch {
    error.value = 'No se pudieron cargar las finanzas.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(
  () => branch.activeBranchId,
  () => {
    finance.categoryFilter = null
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

    <div v-if="loading" class="text-steel-500">Cargando finanzas…</div>

    <template v-else-if="branch.hasActiveBranch">
      <ExpensesArea
        v-if="area === 'expenses'"
        :employee-options="employeeOptions"
        :category-options="categoryOptions"
        :can-manage="canManage"
      />
      <CategoriesArea v-else :can-manage="canManage" />
    </template>
  </div>
</template>
