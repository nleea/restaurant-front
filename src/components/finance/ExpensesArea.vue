<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import { useFinanceStore } from '@/stores/finance'
import { useBranchStore } from '@/stores/branch'
import { formatCOP } from '@/lib/money'
import { statusOf } from '@/lib/apiError'

const props = defineProps<{
  employeeOptions: { label: string; value: string }[]
  categoryOptions: { label: string; value: string }[]
  canManage: boolean
}>()

const finance = useFinanceStore()
const branch = useBranchStore()

// Category filter (null = all). Changing it reloads the branch's expenses server-side.
const filterValue = ref<string | null>(finance.categoryFilter)
const filterOptions = computed(() => [{ label: 'Todas las categorías', value: null }, ...props.categoryOptions])

async function applyFilter() {
  if (branch.activeBranchId) await finance.loadExpenses(branch.activeBranchId, filterValue.value)
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'medium' })
}

// --- Record expense dialog -------------------------------------------------
const showRecord = ref(false)
const fCategory = ref<string | null>(null)
const fDescription = ref('')
const fAmount = ref<number | null>(null)
const fEmployee = ref<string | null>(null)
const fDate = ref<Date | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

function openRecord() {
  fCategory.value = filterValue.value
  fDescription.value = ''
  fAmount.value = null
  fEmployee.value = null
  fDate.value = null
  formError.value = null
  showRecord.value = true
}

const canSubmit = computed(
  () =>
    fCategory.value !== null &&
    fDescription.value.trim() !== '' &&
    fAmount.value !== null &&
    fAmount.value > 0 &&
    fEmployee.value !== null,
)

async function submit() {
  if (!canSubmit.value || !branch.activeBranchId || fCategory.value === null || fEmployee.value === null) return
  saving.value = true
  formError.value = null
  try {
    await finance.recordExpense({
      branch_id: branch.activeBranchId,
      expense_category_id: fCategory.value,
      description: fDescription.value.trim(),
      amount: (fAmount.value ?? 0).toFixed(2),
      employee_id: fEmployee.value,
      incurred_at: fDate.value ? fDate.value.toISOString() : null,
    })
    showRecord.value = false
  } catch (e) {
    const status = statusOf(e)
    formError.value =
      status === 422 ? 'Datos inválidos: revisa el monto.' : status === 404 ? 'Categoría o empleado no encontrado.' : 'No se pudo registrar el gasto.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Select
        v-model="filterValue"
        :options="filterOptions"
        option-label="label"
        option-value="value"
        class="w-56"
        @change="applyFilter"
      />
      <Button v-if="canManage" label="Registrar gasto" size="small" icon="pi pi-plus" :disabled="!categoryOptions.length" @click="openRecord" />
    </div>

    <!-- Total + per-category subtotals -->
    <div class="rounded-xl border border-line bg-paper p-4 sm:p-5">
      <div class="flex items-end justify-between gap-3">
        <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Total {{ filterValue ? 'filtrado' : 'del periodo' }}</span>
        <span class="font-mono text-2xl font-extrabold text-ink">{{ formatCOP(finance.total) }}</span>
      </div>
      <div v-if="finance.subtotalsByCategory.length > 1" class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="sub in finance.subtotalsByCategory"
          :key="sub.categoryId"
          class="rounded-lg border border-line bg-app px-2.5 py-1 font-mono text-[11px] text-steel-500"
        >
          {{ finance.categoryName(sub.categoryId) }}: <span class="text-ink">{{ formatCOP(sub.amount) }}</span>
        </span>
      </div>
    </div>

    <!-- Expense list -->
    <div class="rounded-xl border border-line bg-paper">
      <p v-if="!finance.expenses.length" class="px-4 py-6 text-center text-sm text-steel-500">
        No hay gastos registrados{{ filterValue ? ' en esta categoría' : '' }}.
      </p>
      <ul v-else class="divide-y divide-line">
        <li v-for="exp in finance.expenses" :key="exp.id" class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="min-w-0">
            <span class="block truncate text-sm text-ink">{{ exp.description }}</span>
            <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
              {{ finance.categoryName(exp.expense_category_id) }} · {{ formatDate(exp.incurred_at) }}
            </span>
          </span>
          <span class="shrink-0 font-mono text-sm text-ink">{{ formatCOP(exp.amount) }}</span>
        </li>
      </ul>
    </div>

    <!-- Record expense dialog -->
    <Dialog v-model:visible="showRecord" modal header="Registrar gasto" :style="{ width: '28rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="x-cat" class="text-xs font-medium uppercase tracking-wide text-steel-500">Categoría</label>
          <Select id="x-cat" v-model="fCategory" :options="categoryOptions" option-label="label" option-value="value" placeholder="Categoría" fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="x-desc" class="text-xs font-medium uppercase tracking-wide text-steel-500">Descripción</label>
          <InputText id="x-desc" v-model="fDescription" fluid autofocus maxlength="255" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="x-amount" class="text-xs font-medium uppercase tracking-wide text-steel-500">Monto</label>
            <InputNumber id="x-amount" v-model="fAmount" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="x-date" class="text-xs font-medium uppercase tracking-wide text-steel-500">Fecha (opcional)</label>
            <DatePicker id="x-date" v-model="fDate" date-format="dd/mm/yy" show-icon fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="x-emp" class="text-xs font-medium uppercase tracking-wide text-steel-500">Registra</label>
          <Select id="x-emp" v-model="fEmployee" :options="employeeOptions" option-label="label" option-value="value" placeholder="Empleado" fluid />
        </div>
        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showRecord = false" />
        <Button label="Registrar" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
