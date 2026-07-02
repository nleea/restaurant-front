<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useCashStore } from '@/stores/cash'
import { useStaffStore } from '@/stores/staff'
import OpenSessionForm from '@/components/cash/OpenSessionForm.vue'
import ActiveDrawer from '@/components/cash/ActiveDrawer.vue'
import SessionHistory from '@/components/cash/SessionHistory.vue'

// Orchestrates the cash screen: loads the active branch's open session, its history, and the
// staff directory (for the employee pickers), then shows the active drawer or the apertura form
// plus the history. Mutations live in the child components via the cash store (write-through).
const auth = useAuthStore()
const branch = useBranchStore()
const cash = useCashStore()
const staff = useStaffStore()

const canOpen = computed(() => auth.can('cash.open'))
const canMove = computed(() => auth.can('cash.move'))
const canClose = computed(() => auth.can('cash.close'))

const loading = ref(false)
const error = ref<string | null>(null)

// Employees of the active branch, as picker options (name resolved via the staff directory).
const employeeOptions = computed(() =>
  staff.employees
    .filter((e) => e.is_active)
    .map((e) => ({ label: staff.employeeName(e), value: e.id })),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await Promise.all([
        cash.loadBranchCash(branch.activeBranchId),
        cash.loadHistory(branch.activeBranchId),
        staff.ensureLoaded({ branchId: branch.activeBranchId, active: true }),
      ])
    }
  } catch {
    error.value = 'No se pudo cargar la caja.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
// Re-scope everything when the active branch changes.
watch(
  () => branch.activeBranchId,
  () => {
    cash.selectedSessionId = null
    cash.selectedSession = null
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

    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="!branch.hasActiveBranch && !loading"
      class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500"
    >
      Esta cuenta aún no tiene sucursales.
    </p>

    <div v-if="loading" class="text-steel-500">Cargando la caja…</div>

    <template v-else-if="branch.hasActiveBranch">
      <ActiveDrawer
        v-if="cash.hasOpenSession"
        :employee-options="employeeOptions"
        :can-move="canMove"
        :can-close="canClose"
      />
      <OpenSessionForm v-else :employee-options="employeeOptions" :can-open="canOpen" />

      <SessionHistory />
    </template>
  </div>
</template>
