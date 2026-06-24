<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { isConflict } from '@/lib/apiError'
import type { Addon } from '@/services/menu.api'

const auth = useAuthStore()
const menu = useMenuStore()
const canManage = computed(() => auth.can('menu.manage'))

const selected = ref<Addon | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

const showForm = ref(false)
const editingId = ref<string | null>(null)
const fName = ref('')
const fPrice = ref('')
const saving = ref(false)
const formError = ref<string | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    await menu.fetchAddons()
  } catch {
    error.value = 'No se pudieron cargar las adiciones.'
  } finally {
    loading.value = false
  }
})

function openCreate() {
  editingId.value = null
  fName.value = ''
  fPrice.value = ''
  formError.value = null
  showForm.value = true
}

function openEdit(addon: Addon) {
  editingId.value = addon.id
  fName.value = addon.name
  fPrice.value = addon.price
  formError.value = null
  showForm.value = true
}

async function submit() {
  if (!fName.value.trim() || fPrice.value === '' || Number(fPrice.value) < 0) return
  saving.value = true
  formError.value = null
  try {
    if (editingId.value) {
      await menu.updateAddon(editingId.value, { name: fName.value.trim(), price: fPrice.value.trim() })
      selected.value = menu.addons.find((a) => a.id === editingId.value) ?? null
    } else {
      const addon = await menu.createAddon(fName.value.trim(), fPrice.value.trim())
      selected.value = menu.addons.find((a) => a.id === addon.id) ?? addon
    }
    showForm.value = false
  } catch {
    formError.value = 'No se pudo guardar la adición.'
  } finally {
    saving.value = false
  }
}

async function toggleActive(addon: Addon) {
  try {
    await menu.updateAddon(addon.id, { is_active: !addon.is_active })
    selected.value = menu.addons.find((a) => a.id === addon.id) ?? null
  } catch {
    error.value = 'No se pudo actualizar la adición.'
  }
}

async function remove(addon: Addon) {
  error.value = null
  try {
    await menu.deleteAddon(addon.id)
    selected.value = null
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se puede eliminar: la adición está asociada a productos. Desactívala en su lugar.'
      : 'No se pudo eliminar la adición.'
  }
}
</script>

<template>
  <div class="lg:grid lg:grid-cols-[19rem_1fr] lg:gap-6">
    <!-- LIST -->
    <aside class="flex flex-col gap-3" :class="selected ? 'max-lg:hidden' : ''">
      <div class="flex items-center justify-between">
        <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Adiciones</h2>
        <Button v-if="canManage" label="Nueva" size="small" icon="pi pi-plus" @click="openCreate" />
      </div>

      <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
        {{ error }}
      </p>
      <div v-if="loading" class="text-steel-500">Cargando…</div>

      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="addon in menu.addons" :key="addon.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="[
              selected?.id === addon.id ? 'border-ember ring-1 ring-ember/30' : '',
              addon.is_active ? '' : 'opacity-60',
            ]"
            @click="selected = addon"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-ink">{{ addon.name }}</span>
              <span class="font-mono text-[11px] text-steel-500">{{ addon.price }}</span>
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
        Elige una adición.
      </div>

      <Transition name="detail">
        <div v-if="selected" :key="selected.id" class="p-5">
          <button
            type="button"
            class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
            @click="selected = null"
          >
            <i class="pi pi-angle-left" /> Adiciones
          </button>

          <header class="mb-4">
            <h3 class="text-lg font-extrabold text-ink">{{ selected.name }}</h3>
            <p class="font-mono text-sm text-steel-500">
              {{ selected.price }} · {{ selected.is_active ? 'Activa' : 'Inactiva' }}
            </p>
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
      :header="editingId ? 'Editar adición' : 'Nueva adición'"
      :style="{ width: '24rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="a-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="a-name" v-model="fName" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="a-price" class="text-xs font-medium uppercase tracking-wide text-steel-500">Precio</label>
          <InputText id="a-price" v-model="fPrice" inputmode="decimal" placeholder="0.00" fluid />
        </div>
        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showForm = false" />
        <Button label="Guardar" :loading="saving" :disabled="!fName.trim() || fPrice === ''" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
