<script setup lang="ts">
// Master–detail orchestrator for Personal, following the RBAC screen's pattern: one list that
// becomes a full-screen detail under `lg`, both panes at once above it.
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useStaffStore } from '@/stores/staff'
import { statusOf } from '@/lib/apiError'
import EmployeeList from '@/components/staff/EmployeeList.vue'
import EmployeeDetailPanel from '@/components/staff/EmployeeDetailPanel.vue'
import type { Employee } from '@/services/staff.api'

const auth = useAuthStore()
const branch = useBranchStore()
const staff = useStaffStore()
const canManage = computed(() => auth.can('staff.manage'))

// Selection is held by id, never by the employee object: every mutation refetches the list and
// replaces those objects, and a captured reference would freeze the detail on stale state —
// the badge would stop tracking active/inactive right where the toggle needs it to.
const selectedId = ref<string | null>(null)
const selected = computed<Employee | null>(
  () => staff.employees.find((e) => e.id === selectedId.value) ?? null,
)

const error = ref<string | null>(null)
const loading = ref(false)
const activeOnly = ref(true)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    await staff.ensureLoaded({ branchId: branch.activeBranchId ?? undefined })
  } catch {
    error.value = 'No se pudo cargar el personal.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
// Re-scope the list when the active branch changes.
watch(
  () => branch.activeBranchId,
  () => {
    selectedId.value = null
    void load()
  },
)

const visibleEmployees = computed(() =>
  activeOnly.value ? staff.employees.filter((e) => e.is_active) : staff.employees,
)

// Keep a selected employee on screen even after they're filtered out of the list: hiding the
// detail the instant someone is deactivated would take the reactivate switch away with it.
const detailEmployee = computed(() => selected.value)

const roleOptions = computed(() => staff.roles.map((r) => ({ label: r.name, value: r.id })))

// --- Add-employee dialog ---------------------------------------------------
const showForm = ref(false)
const fFirst = ref('')
const fLast = ref('')
const fEmail = ref('')
const fPassword = ref('')
const fRoleId = ref<string | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

function openCreate() {
  fFirst.value = ''
  fLast.value = ''
  fEmail.value = ''
  fPassword.value = ''
  fRoleId.value = null
  formError.value = null
  showForm.value = true
}

const canSubmit = computed(
  () =>
    Boolean(branch.activeBranchId) &&
    fFirst.value.trim() !== '' &&
    fLast.value.trim() !== '' &&
    fEmail.value.trim() !== '' &&
    fPassword.value.length >= 8 &&
    fRoleId.value !== null,
)

async function submit() {
  if (!canSubmit.value || !branch.activeBranchId || !fRoleId.value) return
  saving.value = true
  formError.value = null
  try {
    const employee = await staff.addEmployee({
      first_name: fFirst.value.trim(),
      last_name: fLast.value.trim(),
      email: fEmail.value.trim(),
      password: fPassword.value,
      role_id: fRoleId.value,
      branch_id: branch.activeBranchId,
    })
    selectedId.value = employee.id
    showForm.value = false
  } catch (e) {
    const status = statusOf(e)
    formError.value =
      status === 409
        ? 'Ese correo ya está registrado para este negocio.'
        : status === 422
          ? 'Datos inválidos: revisa el correo y la contraseña (mínimo 8 caracteres).'
          : 'No se pudo crear el empleado.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="lg:grid lg:grid-cols-[20rem_1fr] lg:items-start lg:gap-6">
    <EmployeeList
      :class="detailEmployee ? 'max-lg:hidden' : ''"
      :employees="visibleEmployees"
      :selected-id="selectedId"
      v-model:active-only="activeOnly"
      :can-manage="canManage"
      :loading="loading"
      :error="error"
      :has-active-branch="branch.hasActiveBranch"
      @select="selectedId = $event.id"
      @create="openCreate"
    />

    <section
      class="rounded-xl border border-line bg-paper"
      :class="detailEmployee ? 'max-lg:mt-0' : 'max-lg:hidden'"
    >
      <div
        v-if="!detailEmployee"
        class="grid h-48 place-items-center px-6 text-center text-sm text-steel-500"
      >
        Elige un empleado para ver su detalle.
      </div>

      <EmployeeDetailPanel
        v-else
        :key="detailEmployee.id"
        :employee="detailEmployee"
        :can-manage="canManage"
        @back="selectedId = null"
      />
    </section>

    <!-- Add-employee dialog -->
    <Dialog
      v-model:visible="showForm"
      modal
      header="Nuevo empleado"
      :style="{ width: '28rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <p class="font-mono text-[11px] text-steel-500">
          Sucursal: <span class="text-ink">{{ branch.activeBranch?.name ?? '—' }}</span>
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="e-first" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
            <InputText id="e-first" v-model="fFirst" fluid autofocus />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="e-last" class="text-xs font-medium uppercase tracking-wide text-steel-500">Apellido</label>
            <InputText id="e-last" v-model="fLast" fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="e-email" class="text-xs font-medium uppercase tracking-wide text-steel-500">Correo (acceso)</label>
          <InputText id="e-email" v-model="fEmail" fluid type="email" autocomplete="off" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="e-pass" class="text-xs font-medium uppercase tracking-wide text-steel-500">Contraseña inicial</label>
          <InputText id="e-pass" v-model="fPassword" fluid type="password" autocomplete="new-password" />
          <p class="font-mono text-[11px] text-steel-500">Mínimo 8 caracteres. El empleado podrá cambiarla luego.</p>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="e-role" class="text-xs font-medium uppercase tracking-wide text-steel-500">Rol</label>
          <Select id="e-role" v-model="fRoleId" :options="roleOptions" option-label="label" option-value="value" placeholder="Elige un rol" fluid />
        </div>

        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showForm = false" />
        <Button label="Crear" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
