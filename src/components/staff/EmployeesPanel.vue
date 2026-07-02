<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useStaffStore } from '@/stores/staff'
import { statusOf } from '@/lib/apiError'
import EmployeeDetail from '@/components/staff/EmployeeDetail.vue'
import type { Employee } from '@/services/staff.api'

const auth = useAuthStore()
const branch = useBranchStore()
const staff = useStaffStore()
const canManage = computed(() => auth.can('staff.manage'))

const selected = ref<Employee | null>(null)
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
    selected.value = null
    void load()
  },
)

const visibleEmployees = computed(() =>
  activeOnly.value ? staff.employees.filter((e) => e.is_active) : staff.employees,
)

const roleOptions = computed(() =>
  staff.roles.map((r) => ({ label: r.name, value: r.id })),
)

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
    selected.value = staff.employees.find((e) => e.id === employee.id) ?? employee
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
  <div class="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-6">
    <!-- LIST (drill-down master) -->
    <aside class="flex flex-col gap-3" :class="selected ? 'max-lg:hidden' : ''">
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Empleados</h2>
        <Button
          v-if="canManage"
          label="Nuevo"
          size="small"
          icon="pi pi-plus"
          :disabled="!branch.hasActiveBranch"
          @click="openCreate"
        />
      </div>

      <label class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
        <ToggleSwitch v-model="activeOnly" />
        Solo activos
      </label>

      <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
        {{ error }}
      </p>
      <p v-else-if="!branch.hasActiveBranch" class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500">
        Esta cuenta aún no tiene sucursales.
      </p>
      <div v-if="loading" class="text-steel-500">Cargando personal…</div>

      <p v-else-if="!visibleEmployees.length" class="text-steel-500">
        No hay empleados en esta sucursal.
      </p>

      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="emp in visibleEmployees" :key="emp.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="selected?.id === emp.id ? 'border-ember ring-1 ring-ember/30' : ''"
            @click="selected = emp"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-ink">{{ staff.employeeName(emp) }}</span>
              <span class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                {{ staff.roleName(emp.role_id) }} · {{ staff.branchName(emp.branch_id) }}
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <span
                v-if="!emp.is_active"
                class="rounded-full bg-steel-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-steel-500"
              >
                Inactivo
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
    <section
      class="rounded-xl border border-line bg-paper"
      :class="selected ? 'max-lg:mt-0' : 'max-lg:hidden'"
    >
      <div v-if="!selected" class="grid h-48 place-items-center px-6 text-center text-steel-500">
        Elige un empleado para ver su detalle.
      </div>

      <Transition name="detail">
        <EmployeeDetail
          v-if="selected"
          :key="selected.id"
          :employee="selected"
          :can-manage="canManage"
          @back="selected = null"
        />
      </Transition>
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
