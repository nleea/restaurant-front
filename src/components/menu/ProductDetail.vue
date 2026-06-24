<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
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

// --- Inline editing --------------------------------------------------------
// The drawer is the workspace: every field is editable in place. A save bar
// surfaces only once something actually changed.
const fName = ref(props.product.name)
const fCategoryId = ref<string>(props.product.category_id)
const fDescription = ref(props.product.description ?? '')
const fImageUrl = ref(props.product.image_url ?? '')
const saving = ref(false)
const saved = ref(false)

const categoryOptions = computed(() => menu.categories.map((c) => ({ label: c.name, value: c.id })))

const dirty = computed(
  () =>
    fName.value.trim() !== props.product.name ||
    fCategoryId.value !== props.product.category_id ||
    fDescription.value.trim() !== (props.product.description ?? '') ||
    fImageUrl.value.trim() !== (props.product.image_url ?? ''),
)
const canSave = computed(() => canManage.value && dirty.value && fName.value.trim() !== '')

function resetFields() {
  fName.value = props.product.name
  fCategoryId.value = props.product.category_id
  fDescription.value = props.product.description ?? ''
  fImageUrl.value = props.product.image_url ?? ''
}

// A successful save clears the "saved" flash the moment the worker edits again.
watch([fName, fCategoryId, fDescription, fImageUrl], () => {
  if (dirty.value) saved.value = false
})

async function saveFields() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  try {
    await menu.updateProduct(props.product.id, {
      name: fName.value.trim(),
      category_id: fCategoryId.value,
      description: fDescription.value.trim() || null,
      image_url: fImageUrl.value.trim() || null,
    })
    saved.value = true
  } catch {
    error.value = 'No se pudo guardar el plato.'
  } finally {
    saving.value = false
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

const attachedCount = computed(
  () => menu.addons.filter((a) => attachedIds.value.has(a.id)).length,
)

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

async function toggleAddon(addon: Addon) {
  if (!canManage.value) return
  const attach = !attachedIds.value.has(addon.id)
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
  <div class="relative flex h-full flex-col">
    <div class="flex-1 overflow-y-auto p-5 pb-24">
      <button
        type="button"
        class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
        @click="emit('back')"
      >
        <i class="pi pi-angle-left" /> Productos
      </button>

      <!-- Photo: live preview that updates as the URL field changes -->
      <div class="relative mb-4 overflow-hidden rounded-xl border border-line bg-app">
        <div class="aspect-[16/10] w-full">
          <img
            v-if="fImageUrl.trim()"
            :src="fImageUrl.trim()"
            class="size-full object-cover"
            alt=""
          />
          <div v-else class="grid size-full place-items-center text-center">
            <div class="flex flex-col items-center gap-1">
              <i class="pi pi-image text-2xl text-steel-500/60" />
              <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Sin foto</span>
            </div>
          </div>
        </div>
        <span
          class="absolute left-2 top-2 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
          :class="product.is_active ? 'bg-ember/90 text-graphite-900' : 'bg-graphite-900/85 text-paper'"
        >
          {{ product.is_active ? 'Activo' : 'Inactivo' }}
        </span>
      </div>

      <div v-if="canManage" class="mb-5 flex flex-col gap-1.5">
        <label for="d-img" class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">URL de la foto</label>
        <InputText id="d-img" v-model="fImageUrl" placeholder="https://…" fluid />
      </div>

      <p v-if="error" role="alert" class="mb-4 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
        {{ error }}
      </p>

      <!-- Identity: name + category, editable in place -->
      <div class="mb-5 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label for="d-name" class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Nombre del plato</label>
          <InputText
            id="d-name"
            v-model="fName"
            :readonly="!canManage"
            class="!font-display !text-lg !font-extrabold"
            fluid
          />
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label for="d-cat" class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Categoría</label>
            <Select
              id="d-cat"
              v-model="fCategoryId"
              :options="categoryOptions"
              option-label="label"
              option-value="value"
              :disabled="!canManage"
              fluid
            />
          </div>
          <div v-if="canManage" class="flex flex-col gap-1.5">
            <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Estado</span>
            <button
              type="button"
              class="flex h-[2.6rem] items-center justify-between rounded-md border border-line px-3 text-sm transition hover:border-ember/50"
              @click="toggleActive"
            >
              <span class="text-ink">{{ product.is_active ? 'Activo' : 'Inactivo' }}</span>
              <span
                class="relative inline-flex h-5 w-9 items-center rounded-full transition"
                :class="product.is_active ? 'bg-ember' : 'bg-line'"
              >
                <span
                  class="absolute size-4 rounded-full bg-paper shadow transition-all"
                  :class="product.is_active ? 'left-[1.15rem]' : 'left-0.5'"
                />
              </span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="d-desc" class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Descripción</label>
          <Textarea
            id="d-desc"
            v-model="fDescription"
            :readonly="!canManage"
            rows="2"
            auto-resize
            placeholder="Ingredientes, notas para la cocina…"
            fluid
          />
        </div>
      </div>

      <!-- Per-branch price -->
      <section class="mb-5 rounded-xl border border-line p-4">
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

      <!-- Addons: interactive toggle chips -->
      <section class="rounded-xl border border-line p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h4 class="font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Adiciones</h4>
          <span v-if="addonsLoaded && menu.addons.length" class="font-mono text-[11px] text-steel-500">
            {{ attachedCount }} de {{ menu.addons.length }}
          </span>
        </div>

        <p v-if="addonError" role="alert" class="mb-2 font-mono text-[11px] text-alert">{{ addonError }}</p>
        <p v-if="menu.addons.length === 0" class="font-mono text-[11px] text-steel-500">
          No hay adiciones en el catálogo. Créalas en la pestaña Adiciones.
        </p>

        <div v-else-if="addonsLoaded" class="flex flex-wrap gap-2">
          <button
            v-for="addon in menu.addons"
            :key="addon.id"
            type="button"
            :disabled="!canManage"
            class="group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30 disabled:cursor-default"
            :class="attachedIds.has(addon.id)
              ? 'border-ember bg-ember/10 text-ink'
              : 'border-line text-steel-500 hover:border-ember/40 hover:text-ink'"
            :aria-pressed="attachedIds.has(addon.id)"
            @click="toggleAddon(addon)"
          >
            <i
              class="text-[11px]"
              :class="attachedIds.has(addon.id) ? 'pi pi-check text-ember' : 'pi pi-plus text-steel-500'"
            />
            <span>{{ addon.name }}</span>
            <span class="font-mono text-[11px] text-steel-500">{{ addon.price }}</span>
          </button>
        </div>
        <div v-else class="text-steel-500">Cargando adiciones…</div>
      </section>

      <!-- Danger zone -->
      <div v-if="canManage" class="mt-5 flex justify-end">
        <Button label="Eliminar plato" size="small" outlined severity="danger" icon="pi pi-trash" @click="remove" />
      </div>
    </div>

    <!-- Sticky save bar: appears only when there are unsaved field changes -->
    <Transition name="savebar">
      <div
        v-if="canManage && (dirty || saved)"
        class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur"
      >
        <span v-if="saved && !dirty" class="flex items-center gap-1.5 font-mono text-[11px] text-ember">
          <i class="pi pi-check-circle" /> Cambios guardados
        </span>
        <span v-else class="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">
          Cambios sin guardar
        </span>
        <div class="flex items-center gap-2">
          <Button v-if="dirty" label="Descartar" size="small" text severity="secondary" @click="resetFields" />
          <Button
            v-if="dirty"
            label="Guardar"
            size="small"
            icon="pi pi-check"
            :loading="saving"
            :disabled="!canSave"
            @click="saveFields"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.savebar-enter-from,
.savebar-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
.savebar-enter-active,
.savebar-leave-active {
  transition: opacity 0.2s ease, transform 0.24s cubic-bezier(0.2, 0.7, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  .savebar-enter-from,
  .savebar-leave-to {
    opacity: 1;
    transform: none;
  }
  .savebar-enter-active,
  .savebar-leave-active {
    transition: none;
  }
}
</style>
