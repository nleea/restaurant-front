<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { useBranchStore } from '@/stores/branch'
import { isConflict } from '@/lib/apiError'
import type { Addon, Product } from '@/services/menu.api'

const props = defineProps<{ product: Product }>()
const emit = defineEmits<{ back: [] }>()

const auth = useAuthStore()
const menu = useMenuStore()
const branch = useBranchStore()
const canManage = computed(() => auth.can('menu.manage'))

const error = ref<string | null>(null)

// --- Edit dialog -----------------------------------------------------------
const showEdit = ref(false)
const fName = ref('')
const fCategoryId = ref<string | null>(null)
const fDescription = ref('')
const fImageUrl = ref('')
const savingEdit = ref(false)
const editError = ref<string | null>(null)

const categoryOptions = computed(() => menu.categories.map((c) => ({ label: c.name, value: c.id })))

function openEdit() {
  fName.value = props.product.name
  fCategoryId.value = props.product.category_id
  fDescription.value = props.product.description ?? ''
  fImageUrl.value = props.product.image_url ?? ''
  editError.value = null
  showEdit.value = true
}

async function submitEdit() {
  if (!fName.value.trim() || !fCategoryId.value) return
  savingEdit.value = true
  editError.value = null
  try {
    await menu.updateProduct(props.product.id, {
      name: fName.value.trim(),
      category_id: fCategoryId.value,
      description: fDescription.value.trim() || null,
      image_url: fImageUrl.value.trim() || null,
    })
    showEdit.value = false
  } catch {
    editError.value = 'No se pudo guardar el producto.'
  } finally {
    savingEdit.value = false
  }
}

async function toggleActive() {
  error.value = null
  try {
    await menu.updateProduct(props.product.id, { is_active: !props.product.is_active })
  } catch {
    error.value = 'No se pudo actualizar el producto.'
  }
}

async function remove() {
  error.value = null
  try {
    await menu.deleteProduct(props.product.id)
    emit('back')
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se puede eliminar: el producto tiene dependencias (precios, recetas o pedidos). Desactívalo en su lugar.'
      : 'No se pudo eliminar el producto.'
  }
}

// --- Per-branch price ------------------------------------------------------
const priceInput = ref('')
const priceLoaded = ref(false)
const savingPrice = ref(false)
const priceError = ref<string | null>(null)
const priceSaved = ref(false)

async function loadPrice() {
  priceInput.value = ''
  priceLoaded.value = false
  if (!branch.activeBranchId) {
    priceLoaded.value = true
    return
  }
  try {
    const prices = await menu.listPrices(props.product.id)
    priceInput.value = prices.find((p) => p.branch_id === branch.activeBranchId)?.price ?? ''
  } catch {
    priceError.value = 'No se pudo cargar el precio.'
  } finally {
    priceLoaded.value = true
  }
}

async function savePrice() {
  if (!branch.activeBranchId || Number(priceInput.value) < 0 || priceInput.value === '') return
  savingPrice.value = true
  priceError.value = null
  priceSaved.value = false
  try {
    await menu.setPrice(props.product.id, branch.activeBranchId, priceInput.value.trim())
    priceSaved.value = true
  } catch {
    priceError.value = 'No se pudo guardar el precio.'
  } finally {
    savingPrice.value = false
  }
}

// --- Addons ----------------------------------------------------------------
const attachedIds = ref<Set<string>>(new Set())
const addonsLoaded = ref(false)
const addonError = ref<string | null>(null)

async function loadAddons() {
  try {
    const attached = await menu.listProductAddons(props.product.id)
    attachedIds.value = new Set(attached.map((a) => a.id))
  } catch {
    addonError.value = 'No se pudieron cargar las adiciones.'
  } finally {
    addonsLoaded.value = true
  }
}

async function toggleAddon(addon: Addon, attach: boolean) {
  const next = new Set(attachedIds.value)
  if (attach) next.add(addon.id)
  else next.delete(addon.id)
  attachedIds.value = next
  try {
    if (attach) await menu.attachAddon(props.product.id, addon.id)
    else await menu.detachAddon(props.product.id, addon.id)
  } catch {
    // revert on failure
    const reverted = new Set(attachedIds.value)
    if (attach) reverted.delete(addon.id)
    else reverted.add(addon.id)
    attachedIds.value = reverted
    addonError.value = `No se pudo actualizar la adición "${addon.name}".`
  }
}

onMounted(() => {
  branch.ensureLoaded()
  loadPrice()
  loadAddons()
})
</script>

<template>
  <div class="p-5">
    <button
      type="button"
      class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
      @click="emit('back')"
    >
      <i class="pi pi-angle-left" /> Productos
    </button>

    <header class="mb-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-lg font-extrabold text-ink">{{ product.name }}</h3>
        <p class="font-mono text-[11px] uppercase tracking-wide text-steel-500">
          {{ menu.categoryName(product.category_id) ?? '—' }} · {{ product.is_active ? 'Activo' : 'Inactivo' }}
        </p>
        <p v-if="product.description" class="mt-1 text-sm text-steel-500">{{ product.description }}</p>
      </div>
    </header>

    <p v-if="error" role="alert" class="mb-4 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>

    <div v-if="canManage" class="mb-5 flex flex-wrap gap-2">
      <Button label="Editar" size="small" outlined icon="pi pi-pencil" @click="openEdit" />
      <Button
        :label="product.is_active ? 'Desactivar' : 'Activar'"
        size="small"
        outlined
        severity="secondary"
        @click="toggleActive"
      />
      <Button label="Eliminar" size="small" outlined severity="danger" icon="pi pi-trash" @click="remove" />
    </div>

    <!-- Per-branch price -->
    <section class="mb-5 rounded-lg border border-line p-4">
      <h4 class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Precio (sucursal)</h4>

      <div v-if="!branch.hasActiveBranch" class="font-mono text-[11px] text-steel-500">
        Selecciona una sucursal para fijar precios. (Configura <code>VITE_DEFAULT_BRANCH_ID</code> en el entorno.)
      </div>

      <div v-else-if="priceLoaded" class="flex items-end gap-2">
        <div class="flex flex-1 flex-col gap-1.5">
          <label for="price" class="text-xs text-steel-500">Precio de venta</label>
          <InputText
            id="price"
            v-model="priceInput"
            inputmode="decimal"
            :disabled="!canManage"
            placeholder="0.00"
            fluid
          />
        </div>
        <Button
          v-if="canManage"
          label="Guardar"
          size="small"
          :loading="savingPrice"
          :disabled="priceInput === ''"
          @click="savePrice"
        />
      </div>
      <div v-else class="text-steel-500">Cargando precio…</div>

      <p v-if="priceSaved" class="mt-2 font-mono text-[11px] text-ember">Precio guardado.</p>
      <p v-if="priceError" role="alert" class="mt-2 font-mono text-[11px] text-alert">{{ priceError }}</p>
    </section>

    <!-- Addons -->
    <section class="rounded-lg border border-line p-4">
      <h4 class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Adiciones disponibles</h4>

      <p v-if="addonError" role="alert" class="mb-2 font-mono text-[11px] text-alert">{{ addonError }}</p>
      <p v-if="menu.addons.length === 0" class="font-mono text-[11px] text-steel-500">
        No hay adiciones en el catálogo. Créalas en la pestaña Adiciones.
      </p>

      <div v-else-if="addonsLoaded" class="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        <label
          v-for="addon in menu.addons"
          :key="addon.id"
          class="flex items-start gap-2.5 text-sm"
          :class="canManage ? 'cursor-pointer' : 'cursor-default opacity-80'"
        >
          <input
            type="checkbox"
            class="mt-0.5 size-4 accent-ember"
            :checked="attachedIds.has(addon.id)"
            :disabled="!canManage"
            @change="toggleAddon(addon, ($event.target as HTMLInputElement).checked)"
          />
          <span>
            <span class="text-ink">{{ addon.name }}</span>
            <span class="block font-mono text-[11px] text-steel-500">{{ addon.price }}</span>
          </span>
        </label>
      </div>
      <div v-else class="text-steel-500">Cargando adiciones…</div>
    </section>

    <!-- Edit dialog -->
    <Dialog
      v-model:visible="showEdit"
      modal
      header="Editar producto"
      :style="{ width: '28rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="e-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="e-name" v-model="fName" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="e-cat" class="text-xs font-medium uppercase tracking-wide text-steel-500">Categoría</label>
          <Select
            id="e-cat"
            v-model="fCategoryId"
            :options="categoryOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="e-desc" class="text-xs font-medium uppercase tracking-wide text-steel-500">Descripción</label>
          <Textarea id="e-desc" v-model="fDescription" rows="2" auto-resize fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="e-img" class="text-xs font-medium uppercase tracking-wide text-steel-500">URL de imagen</label>
          <InputText id="e-img" v-model="fImageUrl" fluid />
        </div>
        <p v-if="editError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ editError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showEdit = false" />
        <Button label="Guardar" :loading="savingEdit" :disabled="!fName.trim() || !fCategoryId" @click="submitEdit" />
      </template>
    </Dialog>
  </div>
</template>
