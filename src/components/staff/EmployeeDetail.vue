<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useStaffStore, isValidShiftRange } from '@/stores/staff'
import { statusOf } from '@/lib/apiError'
import type { Employee } from '@/services/staff.api'

const props = defineProps<{ employee: Employee; canManage: boolean }>()
const emit = defineEmits<{ back: [] }>()

const staff = useStaffStore()

// --- Role ------------------------------------------------------------------
const roleId = ref(props.employee.role_id)
const savingRole = ref(false)
const roleOptions = computed(() => staff.roles.map((r) => ({ label: r.name, value: r.id })))
const roleChanged = computed(() => roleId.value !== props.employee.role_id)

async function saveRole() {
  if (!roleChanged.value) return
  savingRole.value = true
  try {
    await staff.changeRole(props.employee.id, roleId.value)
  } finally {
    savingRole.value = false
  }
}

// --- Deactivate ------------------------------------------------------------
const deactivating = ref(false)
async function deactivate() {
  deactivating.value = true
  try {
    await staff.deactivate(props.employee.id)
    emit('back')
  } finally {
    deactivating.value = false
  }
}

// --- Planned shifts --------------------------------------------------------
const shiftsLoading = ref(false)
const shiftError = ref<string | null>(null)
const fDate = ref('')
const fStart = ref('')
const fEnd = ref('')
const addingShift = ref(false)

const shifts = computed(() => staff.shiftsOf(props.employee.id))
const rangeValid = computed(
  () => fStart.value !== '' && fEnd.value !== '' && isValidShiftRange(fStart.value, fEnd.value),
)
const canAddShift = computed(() => fDate.value !== '' && rangeValid.value)

async function loadShifts() {
  shiftsLoading.value = true
  shiftError.value = null
  try {
    await staff.fetchShifts(props.employee.id)
  } catch {
    shiftError.value = 'No se pudieron cargar los turnos.'
  } finally {
    shiftsLoading.value = false
  }
}

onMounted(loadShifts)
watch(
  () => props.employee.id,
  () => {
    roleId.value = props.employee.role_id
    fDate.value = ''
    fStart.value = ''
    fEnd.value = ''
    void loadShifts()
  },
)

async function addShift() {
  if (!canAddShift.value) return
  addingShift.value = true
  shiftError.value = null
  try {
    await staff.addShift(props.employee.id, {
      shift_date: fDate.value,
      start_time: fStart.value,
      end_time: fEnd.value,
    })
    fDate.value = ''
    fStart.value = ''
    fEnd.value = ''
  } catch (e) {
    shiftError.value =
      statusOf(e) === 422 ? 'Turno inválido: revisa la fecha y el rango horario.' : 'No se pudo crear el turno.'
  } finally {
    addingShift.value = false
  }
}

async function removeShift(shiftId: string) {
  shiftError.value = null
  try {
    await staff.removeShift(props.employee.id, shiftId)
  } catch {
    shiftError.value = 'No se pudo eliminar el turno.'
  }
}

const hhmm = (t: string) => t.slice(0, 5)
</script>

<template>
  <div class="p-5">
    <button
      type="button"
      class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
      @click="emit('back')"
    >
      <i class="pi pi-angle-left" /> Empleados
    </button>

    <header class="mb-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate text-lg font-extrabold text-ink">{{ staff.employeeName(employee) }}</h3>
        <p class="truncate font-mono text-sm text-steel-500">{{ staff.employeeEmail(employee) }}</p>
      </div>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
        :class="employee.is_active ? 'bg-ember/10 text-ember' : 'bg-steel-500/10 text-steel-500'"
      >
        {{ employee.is_active ? 'Activo' : 'Inactivo' }}
      </span>
    </header>

    <dl class="mb-5 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
      <dt class="text-steel-500">Sucursal</dt>
      <dd class="text-ink">{{ staff.branchName(employee.branch_id) }}</dd>
    </dl>

    <!-- Role -->
    <section class="mb-5 rounded-xl border border-line p-4">
      <h4 class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Rol</h4>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <Select
            v-model="roleId"
            :options="roleOptions"
            option-label="label"
            option-value="value"
            :disabled="!canManage"
            fluid
          />
        </div>
        <Button
          v-if="canManage"
          label="Cambiar"
          size="small"
          :loading="savingRole"
          :disabled="!roleChanged"
          @click="saveRole"
        />
      </div>
    </section>

    <!-- Deactivate -->
    <section v-if="canManage && employee.is_active" class="mb-5">
      <Button
        label="Desactivar empleado"
        severity="danger"
        outlined
        size="small"
        icon="pi pi-ban"
        :loading="deactivating"
        @click="deactivate"
      />
    </section>

    <!-- Planned shifts -->
    <section class="rounded-xl border border-line p-4">
      <h4 class="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Turnos planificados</h4>

      <p v-if="shiftError" role="alert" class="mb-3 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
        {{ shiftError }}
      </p>

      <div v-if="shiftsLoading" class="text-steel-500">Cargando turnos…</div>
      <p v-else-if="!shifts.length" class="text-sm text-steel-500">Sin turnos planificados.</p>
      <ul v-else class="mb-4 flex flex-col gap-1.5">
        <li
          v-for="s in shifts"
          :key="s.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-line bg-app px-3 py-2"
        >
          <span class="font-mono text-sm text-ink">
            {{ s.shift_date }}
            <span class="text-steel-500">{{ hhmm(s.start_time) }}–{{ hhmm(s.end_time) }}</span>
          </span>
          <button
            v-if="canManage"
            type="button"
            class="text-steel-500 transition hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/30"
            aria-label="Eliminar turno"
            @click="removeShift(s.id)"
          >
            <i class="pi pi-trash text-sm" />
          </button>
        </li>
      </ul>

      <!-- Add shift -->
      <div v-if="canManage" class="flex flex-col gap-2 border-t border-line pt-3">
        <div class="grid grid-cols-3 gap-2">
          <div class="flex flex-col gap-1">
            <label for="s-date" class="text-[10px] uppercase tracking-wide text-steel-500">Fecha</label>
            <InputText id="s-date" v-model="fDate" type="date" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label for="s-start" class="text-[10px] uppercase tracking-wide text-steel-500">Inicio</label>
            <InputText id="s-start" v-model="fStart" type="time" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label for="s-end" class="text-[10px] uppercase tracking-wide text-steel-500">Fin</label>
            <InputText id="s-end" v-model="fEnd" type="time" fluid />
          </div>
        </div>
        <p v-if="fStart && fEnd && !rangeValid" class="font-mono text-[11px] text-alert">
          La hora de fin debe ser posterior a la de inicio.
        </p>
        <div>
          <Button
            label="Agregar turno"
            size="small"
            icon="pi pi-plus"
            :loading="addingShift"
            :disabled="!canAddShift"
            @click="addShift"
          />
        </div>
      </div>
    </section>
  </div>
</template>
