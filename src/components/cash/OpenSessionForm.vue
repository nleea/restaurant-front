<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useBranchStore } from '@/stores/branch'
import { useCashStore } from '@/stores/cash'
import { statusOf } from '@/lib/apiError'

// Apertura form: shown when the active branch has no open session. Captures an opening employee
// and a non-negative float, then opens the drawer. Gated by `cash.open` from the parent.
const props = defineProps<{
  employeeOptions: { label: string; value: string }[]
  canOpen: boolean
}>()

const branch = useBranchStore()
const cash = useCashStore()

const employeeId = ref<string | null>(null)
const openingAmount = ref<number | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

const canSubmit = computed(
  () =>
    props.canOpen &&
    Boolean(branch.activeBranchId) &&
    employeeId.value !== null &&
    openingAmount.value !== null &&
    openingAmount.value >= 0,
)

async function submit() {
  if (!canSubmit.value || !branch.activeBranchId || employeeId.value === null) return
  saving.value = true
  formError.value = null
  try {
    await cash.openSession({
      branch_id: branch.activeBranchId,
      opened_by_employee_id: employeeId.value,
      opening_amount: (openingAmount.value ?? 0).toFixed(2),
    })
  } catch (e) {
    const status = statusOf(e)
    formError.value =
      status === 409
        ? 'Ya hay una caja abierta para esta sucursal.'
        : status === 404
          ? 'El empleado seleccionado no existe en esta sucursal.'
          : 'No se pudo abrir la caja.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <div class="flex items-center gap-2">
      <span class="grid size-8 place-items-center rounded-lg bg-ember/10 text-ember">
        <i class="pi pi-lock-open text-sm" />
      </span>
      <div>
        <h2 class="text-sm font-semibold text-ink">No hay una caja abierta</h2>
        <p class="font-mono text-[11px] text-steel-500">
          Sucursal: {{ branch.activeBranch?.name ?? '—' }}
        </p>
      </div>
    </div>

    <!-- Read-only users see the state but no apertura controls. -->
    <p v-if="!canOpen" class="mt-4 text-sm text-steel-500">
      Aún no se ha abierto la caja del turno.
    </p>

    <template v-else>
      <p v-if="!employeeOptions.length" class="mt-4 text-sm text-steel-500">
        Registra al menos un empleado en esta sucursal para poder abrir la caja.
      </p>

      <div v-else class="mt-4 flex flex-col gap-4 sm:max-w-md">
        <div class="flex flex-col gap-1.5">
          <label for="open-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Empleado que abre
          </label>
          <Select
            id="open-emp"
            v-model="employeeId"
            :options="employeeOptions"
            option-label="label"
            option-value="value"
            placeholder="Elige un empleado"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="open-amount" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Fondo de apertura
          </label>
          <InputNumber
            id="open-amount"
            v-model="openingAmount"
            :min="0"
            mode="currency"
            currency="COP"
            locale="es-CO"
            :max-fraction-digits="0"
            fluid
          />
        </div>

        <p
          v-if="formError"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ formError }}
        </p>

        <Button
          label="Abrir caja"
          icon="pi pi-lock-open"
          :loading="saving"
          :disabled="!canSubmit"
          class="w-fit"
          @click="submit"
        />
      </div>
    </template>
  </section>
</template>
