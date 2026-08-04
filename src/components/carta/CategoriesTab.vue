<script setup lang="ts">
// Categorías — master–detail, backed by the menu store. El Pase keeps categories mono: a
// two-letter tag, not a rainbow dot. The tag has no backend field — it is derived from the
// name (first two letters), so it is a read-only mark, not an editable field.
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { isConflict, detailOf } from '@/lib/apiError'
import type { Category } from '@/services/menu.api'

const auth = useAuthStore()
const menu = useMenuStore()
const canManage = computed(() => auth.can('menu.manage'))

const selectedId = ref<string | null>(menu.categories[0]?.id ?? null)
const selected = computed<Category | null>(
  () => menu.categories.find((c) => c.id === selectedId.value) ?? null,
)

const editName = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

// Keep the name field in sync with the selected category.
watch(
  selected,
  (c) => {
    editName.value = c?.name ?? ''
  },
  { immediate: true },
)

function tagOf(name: string): string {
  return name.slice(0, 2).toUpperCase() || '··'
}
function countOf(id: string): number {
  return (menu.productsByCategory[id] ?? []).length
}
const productsInCat = computed(() =>
  selected.value ? (menu.productsByCategory[selected.value.id] ?? []) : [],
)

const nameDirty = computed(
  () => selected.value !== null && editName.value.trim() !== '' && editName.value.trim() !== selected.value.name,
)

async function saveName() {
  if (!selected.value || !nameDirty.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await menu.updateCategory(selected.value.id, { name: editName.value.trim() })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo renombrar la categoría.'
  } finally {
    busy.value = false
  }
}

async function toggleActive() {
  if (!selected.value) return
  error.value = null
  try {
    await menu.updateCategory(selected.value.id, { is_active: !selected.value.is_active })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo actualizar el estado.'
  }
}

async function addCategory() {
  error.value = null
  try {
    const created = await menu.createCategory({ name: 'Nueva categoría' })
    selectedId.value = created.id
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo crear la categoría.'
  }
}

async function removeCategory() {
  if (!selected.value) return
  error.value = null
  try {
    await menu.deleteCategory(selected.value.id)
    selectedId.value = menu.categories[0]?.id ?? null
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se puede eliminar: la categoría tiene productos. Muévelos o desactívala.'
      : 'No se pudo eliminar la categoría.'
  }
}

const label = 'mb-1.5 block eyebrow'
const control = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20'
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
    <!-- List -->
    <div class="flex flex-col gap-2">
      <button v-if="canManage" type="button" class="mb-1 inline-flex items-center justify-center gap-2 self-start rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember-600" @click="addCategory">
        <i class="pi pi-plus text-xs" /> Nueva categoría
      </button>
      <p v-if="!menu.categories.length" class="rounded-xl border border-dashed border-line py-10 text-center font-mono text-[12px] text-steel-400">
        Aún no hay categorías.
      </p>
      <button
        v-for="c in menu.categories"
        :key="c.id"
        type="button"
        class="flex items-center gap-3 rounded-xl border bg-paper px-4 py-3 text-left transition"
        :class="selectedId === c.id ? 'border-ember/50 bg-ember-50/40 ring-1 ring-ember/20' : 'border-line hover:border-ember/30'"
        @click="selectedId = c.id"
      >
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-graphite-900 font-mono text-[11px] font-bold tracking-wider text-white">{{ tagOf(c.name) }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-ink">{{ c.name }}</span>
          <span class="font-mono text-[11px] text-steel-500">{{ countOf(c.id) }} productos</span>
        </span>
        <span class="pill" :class="c.is_active ? 'pill-success' : 'pill-neutral'">{{ c.is_active ? 'Activa' : 'Inactiva' }}</span>
      </button>
    </div>

    <!-- Editor -->
    <div v-if="selected" class="card p-6">
      <p class="eyebrow">Editar categoría</p>
      <p v-if="error" role="alert" class="mt-2 rounded-lg bg-alert/8 px-3 py-1.5 font-mono text-[11px] text-alert-600">{{ error }}</p>
      <div class="mt-4 flex flex-col gap-4">
        <div class="flex items-end gap-2">
          <label class="flex-1"><span :class="label">Nombre</span><input v-model="editName" :class="control" :disabled="!canManage" @keyup.enter="saveName" /></label>
          <button v-if="canManage" type="button" :disabled="!nameDirty || busy" class="h-[42px] shrink-0 rounded-lg bg-ember px-4 text-sm font-semibold text-white transition hover:bg-ember-600 disabled:opacity-40" @click="saveName">Guardar</button>
        </div>
        <div class="flex gap-3">
          <div class="w-28">
            <span :class="label">Etiqueta</span>
            <div class="grid h-11 w-full place-items-center rounded-lg border border-line bg-sunken/50 font-mono text-base font-bold uppercase tracking-widest text-ink">{{ tagOf(selected.name) }}</div>
            <span class="mt-1 block font-mono text-[10px] text-steel-400">Derivada del nombre</span>
          </div>
          <div class="flex-1">
            <span :class="label">Estado</span>
            <button
              type="button" role="switch" :aria-checked="selected.is_active" :disabled="!canManage"
              class="mt-1 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 disabled:opacity-60"
              @click="toggleActive"
            >
              <span class="relative h-5 w-9 rounded-full transition" :class="selected.is_active ? 'bg-success' : 'bg-steel-300'">
                <span class="absolute top-0.5 size-4 rounded-full bg-white shadow transition-all" :class="selected.is_active ? 'left-[18px]' : 'left-0.5'" />
              </span>
              <span class="text-sm text-ink">{{ selected.is_active ? 'Activa' : 'Inactiva' }}</span>
            </button>
          </div>
        </div>
        <div>
          <span :class="label">Productos en esta categoría</span>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="p in productsInCat" :key="p.id" class="rounded-md bg-sunken px-2 py-1 font-mono text-[11px] text-steel-600">{{ p.name }}</span>
            <span v-if="!productsInCat.length" class="font-mono text-[11px] text-steel-400">Ninguno aún.</span>
          </div>
        </div>
        <div v-if="canManage" class="flex justify-end border-t border-line pt-3">
          <button type="button" class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-[12px] text-alert-600 transition hover:bg-alert/8" @click="removeCategory">
            <i class="pi pi-trash text-[11px]" /> Eliminar categoría
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
