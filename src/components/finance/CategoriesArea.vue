<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import { useFinanceStore } from '@/stores/finance'
import { statusOf } from '@/lib/apiError'
import type { ExpenseCategory } from '@/services/finance.api'

defineProps<{ canManage: boolean }>()

const finance = useFinanceStore()

const activeOnly = ref(true)
const visibleCategories = computed<ExpenseCategory[]>(() =>
  activeOnly.value ? finance.categories.filter((c) => c.is_active) : finance.categories,
)

// --- Create / rename dialog (shared) ---------------------------------------
const showForm = ref(false)
const editingId = ref<string | null>(null)
const fName = ref('')
const saving = ref(false)
const formError = ref<string | null>(null)

function openCreate() {
  editingId.value = null
  fName.value = ''
  formError.value = null
  showForm.value = true
}
function openRename(category: ExpenseCategory) {
  editingId.value = category.id
  fName.value = category.name
  formError.value = null
  showForm.value = true
}

const canSubmit = computed(() => fName.value.trim() !== '')

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  formError.value = null
  try {
    if (editingId.value) await finance.updateCategory(editingId.value, { name: fName.value.trim() })
    else await finance.createCategory(fName.value.trim())
    showForm.value = false
  } catch (e) {
    formError.value =
      statusOf(e) === 409 ? 'Ya existe una categoría con ese nombre.' : 'No se pudo guardar la categoría.'
  } finally {
    saving.value = false
  }
}

const togglingId = ref<string | null>(null)
async function toggle(category: ExpenseCategory) {
  togglingId.value = category.id
  try {
    if (category.is_active) await finance.deactivateCategory(category.id)
    else await finance.updateCategory(category.id, { is_active: true })
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <label class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
        <ToggleSwitch v-model="activeOnly" />
        Solo activas
      </label>
      <Button v-if="canManage" label="Nueva categoría" size="small" icon="pi pi-plus" @click="openCreate" />
    </div>

    <div class="rounded-xl border border-line bg-paper">
      <p v-if="!visibleCategories.length" class="px-4 py-6 text-center text-sm text-steel-500">
        No hay categorías de gasto.
      </p>
      <ul v-else class="divide-y divide-line">
        <li v-for="cat in visibleCategories" :key="cat.id" class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="min-w-0">
            <span class="block truncate text-sm text-ink">{{ cat.name }}</span>
            <span v-if="!cat.is_active" class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">Inactiva</span>
          </span>
          <span v-if="canManage" class="flex shrink-0 items-center gap-1">
            <Button label="Renombrar" size="small" severity="secondary" text icon="pi pi-pencil" @click="openRename(cat)" />
            <Button
              :label="cat.is_active ? 'Desactivar' : 'Reactivar'"
              size="small"
              severity="secondary"
              text
              :icon="cat.is_active ? 'pi pi-ban' : 'pi pi-check'"
              :loading="togglingId === cat.id"
              @click="toggle(cat)"
            />
          </span>
        </li>
      </ul>
    </div>

    <!-- Create / rename dialog -->
    <Dialog v-model:visible="showForm" modal :header="editingId ? 'Renombrar categoría' : 'Nueva categoría'" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="cat-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="cat-name" v-model="fName" fluid autofocus maxlength="100" />
        </div>
        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showForm = false" />
        <Button :label="editingId ? 'Guardar' : 'Crear'" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
