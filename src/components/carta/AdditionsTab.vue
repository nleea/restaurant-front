<script setup lang="ts">
// Adiciones — the global addon CATALOG (name + price + on/off), backed by the menu store.
// This tab manages the catalog only; attaching an addon to a specific product happens in that
// product's editor (attach/detach). The prototype's "aplica a" and per-addon recipe are dropped
// (no backend equivalent — a catalog addon is just a priced extra).
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { isConflict, detailOf } from '@/lib/apiError'
import { formatCOP } from '@/lib/money'
import type { Addon } from '@/services/menu.api'

const auth = useAuthStore()
const menu = useMenuStore()
const canManage = computed(() => auth.can('menu.manage'))

const selectedId = ref<string | null>(null)
const selected = computed<Addon | null>(() => menu.addons.find((a) => a.id === selectedId.value) ?? null)

const editName = ref('')
const editPrice = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

watch(
  selected,
  (a) => {
    editName.value = a?.name ?? ''
    editPrice.value = a?.price ?? ''
  },
  { immediate: true },
)

const dirty = computed(
  () =>
    selected.value !== null &&
    editName.value.trim() !== '' &&
    (editName.value.trim() !== selected.value.name || editPrice.value.trim() !== selected.value.price),
)

function edit(a: Addon) {
  selectedId.value = a.id
}

async function addAddition() {
  error.value = null
  try {
    const created = await menu.createAddon('Nueva adición', '0')
    selectedId.value = created.id
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo crear la adición.'
  }
}

async function save() {
  if (!selected.value || !dirty.value || busy.value) return
  const price = editPrice.value.trim()
  if (price === '' || Number(price) < 0 || Number.isNaN(Number(price))) {
    error.value = 'El precio debe ser un número válido.'
    return
  }
  busy.value = true
  error.value = null
  try {
    await menu.updateAddon(selected.value.id, { name: editName.value.trim(), price })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo guardar la adición.'
  } finally {
    busy.value = false
  }
}

async function toggleActive(a: Addon) {
  error.value = null
  try {
    await menu.updateAddon(a.id, { is_active: !a.is_active })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo actualizar el estado.'
  }
}

async function remove() {
  if (!selected.value) return
  error.value = null
  try {
    await menu.deleteAddon(selected.value.id)
    selectedId.value = null
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se puede eliminar: la adición está asociada a productos. Desactívala en su lugar.'
      : 'No se pudo eliminar la adición.'
  }
}

const label = 'mb-1.5 block eyebrow'
const control = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20'
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="error" role="alert" class="rounded-lg bg-alert/8 px-3 py-1.5 font-mono text-[11px] text-alert-600">{{ error }}</p>
    <div v-if="canManage" class="flex justify-end">
      <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember-600" @click="addAddition">
        <i class="pi pi-plus text-xs" /> Nueva adición
      </button>
    </div>

    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-line bg-sunken/50 text-left font-mono text-[10px] uppercase tracking-wider text-steel-500">
            <th class="px-4 py-2.5 font-medium">Nombre</th>
            <th class="px-4 py-2.5 text-right font-medium">Precio</th>
            <th class="px-4 py-2.5 font-medium">Estado</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-hairline">
          <tr v-for="a in menu.addons" :key="a.id" class="transition-colors hover:bg-sunken/40" :class="selectedId === a.id && 'bg-ember-50/40'">
            <td class="px-4 py-3 font-medium text-ink">{{ a.name }}</td>
            <td class="px-4 py-3 text-right font-mono tabular-nums" :class="Number(a.price) === 0 ? 'text-steel-400' : 'text-ink'">{{ Number(a.price) === 0 ? 'Gratis' : formatCOP(a.price) }}</td>
            <td class="px-4 py-3">
              <button type="button" class="pill" :class="a.is_active ? 'pill-success' : 'pill-neutral'" :disabled="!canManage" @click="toggleActive(a)">{{ a.is_active ? 'En venta' : 'Oculta' }}</button>
            </td>
            <td class="px-4 py-3 text-right">
              <button type="button" class="grid size-8 place-items-center rounded-lg text-steel-400 transition hover:bg-sunken hover:text-ink" aria-label="Editar" @click="edit(a)"><i class="pi pi-pencil text-xs" /></button>
            </td>
          </tr>
          <tr v-if="!menu.addons.length">
            <td colspan="4" class="px-4 py-10 text-center font-mono text-[12px] text-steel-400">Aún no hay adiciones en el catálogo.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Side editor -->
    <Teleport to="body">
      <div v-if="selected" class="fixed inset-0 z-50" role="dialog" aria-modal="true">
        <div class="fixed inset-0 bg-graphite-900/40 backdrop-blur-sm" @click="selectedId = null" />
        <aside class="side-in absolute right-0 top-0 flex h-full w-full max-w-[30rem] flex-col overflow-y-auto bg-paper shadow-2xl">
          <header class="flex items-center justify-between border-b border-line px-6 py-4">
            <div><p class="eyebrow">Editar adición</p><h3 class="mt-0.5 font-display text-lg font-semibold text-ink">{{ selected.name }}</h3></div>
            <button type="button" class="grid size-8 place-items-center rounded-lg text-steel-400 hover:bg-sunken hover:text-ink" @click="selectedId = null"><i class="pi pi-times text-sm" /></button>
          </header>
          <div class="flex flex-col gap-4 p-6">
            <label><span :class="label">Nombre</span><input v-model="editName" :class="control" :disabled="!canManage" /></label>
            <label>
              <span :class="label">Precio extra</span>
              <div class="flex items-center rounded-lg border border-line bg-surface focus-within:border-ember/60 focus-within:ring-2 focus-within:ring-ember/20">
                <span class="grid h-11 w-9 place-items-center border-r border-line font-mono text-steel-400">$</span>
                <input v-model="editPrice" inputmode="decimal" :disabled="!canManage" class="w-full bg-transparent px-3 font-mono text-base tabular-nums text-ink outline-none" placeholder="0" />
              </div>
            </label>
            <div class="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
              <p class="text-sm font-medium text-ink">En venta</p>
              <button type="button" role="switch" :aria-checked="selected.is_active" :disabled="!canManage" class="relative h-6 w-11 rounded-full transition" :class="selected.is_active ? 'bg-success' : 'bg-steel-300'" @click="toggleActive(selected)">
                <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all" :class="selected.is_active ? 'left-[22px]' : 'left-0.5'" />
              </button>
            </div>
          </div>
          <footer class="mt-auto flex items-center justify-between gap-2 border-t border-line px-6 py-4">
            <button v-if="canManage" type="button" class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-[12px] text-alert-600 transition hover:bg-alert/8" @click="remove">
              <i class="pi pi-trash text-[11px]" /> Eliminar
            </button>
            <div class="ml-auto flex gap-2">
              <button type="button" class="rounded-lg px-4 py-2.5 text-sm font-medium text-steel-600 hover:bg-sunken" @click="selectedId = null">Cerrar</button>
              <button v-if="canManage" type="button" :disabled="!dirty || busy" class="rounded-lg bg-ember px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-600 disabled:opacity-40" @click="save">Guardar</button>
            </div>
          </footer>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
@keyframes side-in { from { transform: translateX(16px); opacity: 0; } to { transform: none; opacity: 1; } }
.side-in { animation: side-in 0.2s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
@media (prefers-reduced-motion: reduce) { .side-in { animation: none; } }
</style>
