<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { isConflict } from '@/lib/apiError'
import type { Category } from '@/services/menu.api'

const auth = useAuthStore()
const menu = useMenuStore()
const canManage = computed(() => auth.can('menu.manage'))

const selected = ref<Category | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const showInactive = ref(false)

const showForm = ref(false)
const editingId = ref<string | null>(null)
const fName = ref('')
const fParentId = ref<string | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    await menu.fetchCategories()
  } catch {
    error.value = 'No se pudieron cargar las categorías.'
  } finally {
    loading.value = false
  }
})

const visibleCategories = computed(() =>
  showInactive.value ? menu.categories : menu.categories.filter((c) => c.is_active),
)

// Parent options exclude the category being edited (no self-parenting).
const parentOptions = computed(() =>
  menu.categories
    .filter((c) => c.id !== editingId.value)
    .map((c) => ({ label: c.name, value: c.id })),
)

function select(cat: Category) {
  selected.value = cat
}

function openCreate() {
  editingId.value = null
  fName.value = ''
  fParentId.value = null
  formError.value = null
  showForm.value = true
}

function openEdit(cat: Category) {
  editingId.value = cat.id
  fName.value = cat.name
  fParentId.value = cat.parent_category_id
  formError.value = null
  showForm.value = true
}

async function submit() {
  if (!fName.value.trim()) return
  saving.value = true
  formError.value = null
  try {
    if (editingId.value) {
      await menu.updateCategory(editingId.value, {
        name: fName.value.trim(),
        parent_category_id: fParentId.value,
      })
      selected.value = menu.categories.find((c) => c.id === editingId.value) ?? null
    } else {
      const cat = await menu.createCategory({
        name: fName.value.trim(),
        parent_category_id: fParentId.value,
      })
      selected.value = menu.categories.find((c) => c.id === cat.id) ?? cat
    }
    showForm.value = false
  } catch {
    formError.value = 'No se pudo guardar la categoría.'
  } finally {
    saving.value = false
  }
}

async function toggleActive(cat: Category) {
  try {
    await menu.updateCategory(cat.id, { is_active: !cat.is_active })
    selected.value = menu.categories.find((c) => c.id === cat.id) ?? null
  } catch {
    error.value = 'No se pudo actualizar la categoría.'
  }
}

async function remove(cat: Category) {
  error.value = null
  try {
    await menu.deleteCategory(cat.id)
    selected.value = null
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se puede eliminar: la categoría tiene productos u otras dependencias. Desactívala en su lugar.'
      : 'No se pudo eliminar la categoría.'
  }
}
</script>

<template>
  <div class="lg:grid lg:grid-cols-[19rem_1fr] lg:gap-6">
    <!-- LIST -->
    <aside class="flex flex-col gap-3" :class="selected ? 'max-lg:hidden' : ''">
      <div class="flex items-center justify-between">
        <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Categorías</h2>
        <Button v-if="canManage" label="Nueva" size="small" icon="pi pi-plus" @click="openCreate" />
      </div>

      <label class="flex items-center gap-2 text-xs text-steel-500">
        <input type="checkbox" v-model="showInactive" class="size-3.5 accent-ember" />
        Mostrar inactivas
      </label>

      <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
        {{ error }}
      </p>
      <div v-if="loading" class="text-steel-500">Cargando…</div>

      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="cat in visibleCategories" :key="cat.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="[
              selected?.id === cat.id ? 'border-ember ring-1 ring-ember/30' : '',
              cat.is_active ? '' : 'opacity-60',
            ]"
            @click="select(cat)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-ink">{{ cat.name }}</span>
              <span v-if="cat.parent_category_id" class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
                subcategoría
              </span>
            </span>
            <span class="shrink-0 text-steel-500 lg:hidden" aria-hidden="true">
              <i class="pi pi-angle-right" />
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
        Elige una categoría.
      </div>

      <Transition name="detail">
        <div v-if="selected" :key="selected.id" class="p-5">
          <button
            type="button"
            class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
            @click="selected = null"
          >
            <i class="pi pi-angle-left" /> Categorías
          </button>

          <header class="mb-4 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-lg font-extrabold text-ink">{{ selected.name }}</h3>
              <p class="font-mono text-[11px] uppercase tracking-wide text-steel-500">
                {{ selected.is_active ? 'Activa' : 'Inactiva' }}
                <span v-if="selected.parent_category_id"> · subcategoría de {{ menu.categoryName(selected.parent_category_id) }}</span>
              </p>
            </div>
          </header>

          <div v-if="canManage" class="flex flex-wrap gap-2">
            <Button label="Editar" size="small" outlined icon="pi pi-pencil" @click="openEdit(selected)" />
            <Button
              :label="selected.is_active ? 'Desactivar' : 'Activar'"
              size="small"
              outlined
              severity="secondary"
              @click="toggleActive(selected)"
            />
            <Button label="Eliminar" size="small" outlined severity="danger" icon="pi pi-trash" @click="remove(selected)" />
          </div>
        </div>
      </Transition>
    </section>

    <!-- Create / edit dialog -->
    <Dialog
      v-model:visible="showForm"
      modal
      :header="editingId ? 'Editar categoría' : 'Nueva categoría'"
      :style="{ width: '24rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="c-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="c-name" v-model="fName" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="c-parent" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Categoría padre (opcional)
          </label>
          <Select
            id="c-parent"
            v-model="fParentId"
            :options="parentOptions"
            option-label="label"
            option-value="value"
            placeholder="Ninguna"
            show-clear
            fluid
          />
        </div>
        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showForm = false" />
        <Button label="Guardar" :loading="saving" :disabled="!fName.trim()" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
