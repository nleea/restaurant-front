<script setup lang="ts">
// The full-screen product editor — the redesign's centerpiece. Left: the product's identity
// (image URL, name, category, active-branch price, availability, additions). Right: the sellable
// variants and their recipes, each a full ficha técnica. Everything is backed by the menu store:
// identity + price save on the footer button; variants, recipes and addon attach/detach write
// through immediately. A brand-new product is created first (needs name + category), then its
// variants/recipes/addons unlock — mirroring the real backend (variants are born inactive and can
// only go on sale once they have a recipe).
import { computed, onMounted, ref } from 'vue'
import VariantCard from './VariantCard.vue'
import CreateInsumoModal from './CreateInsumoModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { useBranchStore } from '@/stores/branch'
import { isConflict, detailOf } from '@/lib/apiError'
import { formatCOP } from '@/lib/money'
import type { Addon, Product, ProductVariant } from '@/services/menu.api'

const props = defineProps<{ product: Product | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const auth = useAuthStore()
const menu = useMenuStore()
const branch = useBranchStore()
const canManage = computed(() => auth.can('menu.manage'))

// The authoritative product id once it exists (null while creating a brand-new one).
const productId = ref<string | null>(props.product?.id ?? null)
const isNew = computed(() => productId.value === null)

// --- Identity fields (batched save) ---------------------------------------
const fName = ref(props.product?.name ?? '')
const fCategoryId = ref<string>(props.product?.category_id ?? menu.categories[0]?.id ?? '')
const fDescription = ref(props.product?.description ?? '')
const fImageUrl = ref(props.product?.image_url ?? '')
const fActive = ref(props.product?.is_active ?? false)
const priceInput = ref('')

// Baseline of the last-saved values, for dirty detection.
const baseline = ref({ name: fName.value, cat: fCategoryId.value, desc: fDescription.value, img: fImageUrl.value, price: '' })

const saving = ref(false)
const error = ref<string | null>(null)

const dirty = computed(
  () =>
    fName.value.trim() !== baseline.value.name ||
    fCategoryId.value !== baseline.value.cat ||
    fDescription.value.trim() !== baseline.value.desc ||
    fImageUrl.value.trim() !== baseline.value.img ||
    priceInput.value.trim() !== baseline.value.price,
)
// A valid dish is saveable at any time — we don't gate on `dirty`. The editor's right pane
// (variants, recipes, prices, addons, activation) auto-saves through the store, so gating the
// identity Save on a changed identity field made it feel "stuck" (you had to tweak the name to
// enable it). `dirty` still drives the unsaved-changes dot and the close confirmation.
const canSave = computed(
  () => canManage.value && fName.value.trim() !== '' && fCategoryId.value !== '',
)

const categoryName = computed(() => menu.categoryName(fCategoryId.value) ?? '—')

const basePrice = computed<number | null>(() =>
  priceInput.value.trim() !== '' && Number(priceInput.value) >= 0 ? Number(priceInput.value) : null,
)

// --- Variants + recipes ----------------------------------------------------
const variants = computed<ProductVariant[]>(() =>
  productId.value ? (menu.variantsByProductId[productId.value] ?? []) : [],
)
const anyRecipe = computed(() => variants.value.some((v) => menu.hasRecipe(v.id)))
const addingVariant = ref(false)

async function loadVariants() {
  if (!productId.value) return
  await menu.loadVariants(productId.value)
  await menu.loadRecipeItemsForVariants(variants.value.map((v) => v.id))
}
async function addVariant() {
  if (!productId.value) return
  addingVariant.value = true
  error.value = null
  try {
    await menu.addVariant(productId.value, { name: 'Nueva variante' })
    await menu.loadRecipeItemsForVariants(variants.value.map((v) => v.id))
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo crear la variante.'
  } finally {
    addingVariant.value = false
  }
}
async function removeVariant(v: ProductVariant) {
  if (!productId.value) return
  error.value = null
  try {
    await menu.removeVariant(productId.value, v.id)
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se puede eliminar: la variante tiene pedidos asociados.'
      : 'No se pudo eliminar la variante.'
  }
}

// --- Addons (attach/detach, write-through) ---------------------------------
const attachedIds = ref<Set<string>>(new Set())
const appliedAddons = computed(() => menu.addons.filter((a) => attachedIds.value.has(a.id)))
const availableAddons = computed(() => menu.addons.filter((a) => !attachedIds.value.has(a.id)))
const addonToAdd = ref('')

async function loadAddons() {
  if (!productId.value) return
  try {
    const attached = await menu.listProductAddons(productId.value)
    attachedIds.value = new Set(attached.map((a) => a.id))
  } catch {
    /* leave empty on failure */
  }
}
async function attachAddon() {
  if (!productId.value || !addonToAdd.value) return
  const id = addonToAdd.value
  addonToAdd.value = ''
  const next = new Set(attachedIds.value)
  next.add(id)
  attachedIds.value = next
  try {
    await menu.attachAddon(productId.value, id)
  } catch {
    const reverted = new Set(attachedIds.value)
    reverted.delete(id)
    attachedIds.value = reverted
    error.value = 'No se pudo añadir la adición.'
  }
}
async function detachAddon(addon: Addon) {
  if (!productId.value) return
  const next = new Set(attachedIds.value)
  next.delete(addon.id)
  attachedIds.value = next
  try {
    await menu.detachAddon(productId.value, addon.id)
  } catch {
    const reverted = new Set(attachedIds.value)
    reverted.add(addon.id)
    attachedIds.value = reverted
    error.value = `No se pudo quitar la adición "${addon.name}".`
  }
}

// --- Save (create-or-update identity + price) ------------------------------
async function savePrice() {
  if (!branch.activeBranchId) return
  const p = priceInput.value.trim()
  if (p === '' || Number(p) < 0) return
  if (p === baseline.value.price) return
  await menu.setPrice(productId.value as string, branch.activeBranchId, p)
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    if (isNew.value) {
      const created = await menu.createProduct({
        category_id: fCategoryId.value,
        name: fName.value.trim(),
        description: fDescription.value.trim() || null,
        image_url: fImageUrl.value.trim() || null,
      })
      productId.value = created.id
      await savePrice()
      if (fActive.value) {
        await menu.updateProduct(created.id, { is_active: true })
      }
      await Promise.all([loadVariants(), loadAddons()])
    } else {
      await menu.updateProduct(productId.value as string, {
        name: fName.value.trim(),
        category_id: fCategoryId.value,
        description: fDescription.value.trim() || null,
        image_url: fImageUrl.value.trim() || null,
      })
      await savePrice()
    }
    baseline.value = {
      name: fName.value.trim(),
      cat: fCategoryId.value,
      desc: fDescription.value.trim(),
      img: fImageUrl.value.trim(),
      price: priceInput.value.trim(),
    }
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo guardar el plato.'
  } finally {
    saving.value = false
  }
}

async function toggleActive() {
  if (isNew.value) {
    fActive.value = !fActive.value
    return
  }
  error.value = null
  const target = !fActive.value
  fActive.value = target
  try {
    await menu.updateProduct(productId.value as string, { is_active: target })
    emit('saved')
  } catch {
    fActive.value = !target
    error.value = 'No se pudo actualizar la disponibilidad.'
  }
}

async function remove() {
  if (!productId.value) return
  error.value = null
  try {
    await menu.deleteProduct(productId.value)
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se puede eliminar: el plato tiene dependencias (precios, recetas o pedidos). Desactívalo en su lugar.'
      : 'No se pudo eliminar el plato.'
  }
}

// --- Inline "crear insumo" -------------------------------------------------
const showInsumo = ref(false)
function onInsumoCreated() {
  // The new ingredient is now in the store directory; the user picks it in any bench.
  showInsumo.value = false
}

function tryClose() {
  if (dirty.value && !isNew.value && !confirm('¿Cerrar sin guardar los cambios de identidad?')) return
  emit('close')
}

async function loadPrice() {
  if (!productId.value) return
  await branch.ensureLoaded()
  if (!branch.activeBranchId) return
  try {
    const prices = await menu.listPrices(productId.value)
    const p = prices.find((x) => x.branch_id === branch.activeBranchId)?.price ?? ''
    priceInput.value = p
    baseline.value.price = p
  } catch {
    /* leave blank */
  }
}

onMounted(async () => {
  await branch.ensureLoaded()
  if (productId.value) {
    fActive.value = props.product?.is_active ?? false
    await Promise.all([loadPrice(), loadVariants(), loadAddons()])
  }
})

const label = 'mb-1.5 block eyebrow'
const control = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20'
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-graphite-900/55 backdrop-blur-sm" @click="tryClose" />

      <div class="relative z-10 mx-auto my-0 flex min-h-full max-w-5xl flex-col sm:my-6">
        <div class="flex min-h-full flex-col overflow-hidden rounded-none bg-app shadow-2xl sm:min-h-0 sm:rounded-2xl">
          <!-- Header: the pass strip -->
          <header class="sticky top-0 z-10 bg-pass px-6 py-4 sm:px-8">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-400">
                  {{ isNew ? 'Nuevo plato' : 'Editar plato' }}<span v-if="dirty" class="ml-1 text-ember">•</span>
                </p>
                <h2 class="mt-0.5 truncate font-display text-xl font-bold text-white">
                  {{ fName || 'Sin nombre' }}
                </h2>
                <p class="font-mono text-[11px] text-steel-400">{{ categoryName }}</p>
              </div>
              <button type="button" class="grid size-9 shrink-0 place-items-center rounded-lg text-steel-300 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar" @click="tryClose">
                <i class="pi pi-times" />
              </button>
            </div>
          </header>

          <p v-if="error" role="alert" class="mx-6 mt-4 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert-600 sm:mx-8">{{ error }}</p>

          <!-- Body: two columns -->
          <div class="grid flex-1 gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <!-- LEFT — identity -->
            <div class="flex flex-col gap-5">
              <div>
                <span :class="label">Imagen del plato (URL)</span>
                <div class="grid h-40 w-full place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-surface">
                  <img v-if="fImageUrl.trim()" :src="fImageUrl.trim()" class="size-full object-cover" alt="" />
                  <span v-else class="flex flex-col items-center gap-1 text-steel-400">
                    <i class="pi pi-image text-xl" />
                    <span class="font-mono text-[11px]">Pega una URL de imagen abajo</span>
                  </span>
                </div>
                <input v-model="fImageUrl" :class="[control, 'mt-2']" placeholder="https://…" />
              </div>

              <label><span :class="label">Nombre del plato *</span><input v-model="fName" :class="control" placeholder="Papas Fritas" /></label>
              <label><span :class="label">Descripción</span><textarea v-model="fDescription" rows="3" :class="control" placeholder="Ej: Con hogao y queso costeño rallado" /></label>
              <label>
                <span :class="label">Categoría *</span>
                <select v-model="fCategoryId" :class="control">
                  <option v-for="c in menu.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </label>
              <label>
                <span :class="label">Precio de venta (sucursal)</span>
                <div v-if="!branch.hasActiveBranch" class="rounded-lg bg-sunken/60 px-3 py-2 font-mono text-[11px] text-steel-500">
                  Esta cuenta aún no tiene sucursales para fijar precios.
                </div>
                <div v-else class="flex items-center rounded-lg border border-line bg-surface focus-within:border-ember/60 focus-within:ring-2 focus-within:ring-ember/20">
                  <span class="grid h-11 w-9 place-items-center border-r border-line font-mono text-steel-400">$</span>
                  <input v-model="priceInput" inputmode="decimal" class="w-full bg-transparent px-3 font-mono text-base tabular-nums text-ink outline-none" placeholder="8000" />
                </div>
                <span class="mt-1 block font-mono text-[11px] text-steel-400">El precio base aplica a la variante; cada variante suma su extra.</span>
              </label>

              <div class="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <div>
                  <p class="text-sm font-medium text-ink">En venta</p>
                  <p class="font-mono text-[11px] text-steel-500">Aparece en el menú.</p>
                </div>
                <button
                  type="button" role="switch" :aria-checked="fActive"
                  class="relative h-6 w-11 rounded-full transition"
                  :class="fActive ? 'bg-success' : 'bg-steel-300'"
                  @click="toggleActive"
                >
                  <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all" :class="fActive ? 'left-[22px]' : 'left-0.5'" />
                </button>
              </div>

              <div v-if="!isNew">
                <span :class="label">Adiciones que aplican</span>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span v-for="a in appliedAddons" :key="a.id" class="inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2.5 py-1 font-mono text-[11px] text-steel-600">
                    {{ a.name }}
                    <button type="button" class="text-steel-400 hover:text-alert-600" @click="detachAddon(a)"><i class="pi pi-times text-[9px]" /></button>
                  </span>
                  <span v-if="!appliedAddons.length" class="font-mono text-[11px] text-steel-400">No aplica ninguna.</span>
                </div>
                <select v-if="availableAddons.length" v-model="addonToAdd" class="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-steel-600 outline-none" @change="attachAddon">
                  <option value="">+ Añadir adición…</option>
                  <option v-for="a in availableAddons" :key="a.id" :value="a.id">{{ a.name }} · {{ formatCOP(a.price) }}</option>
                </select>
              </div>
              <p v-else class="rounded-lg border border-dashed border-line bg-sunken/40 px-3 py-3 font-mono text-[11px] text-steel-500">
                Guarda el plato para agregar variantes, recetas y adiciones.
              </p>
            </div>

            <!-- RIGHT — variants & recipes (the star) -->
            <div v-if="!isNew" class="flex flex-col gap-4">
              <div class="rounded-xl border border-info/25 bg-info/6 px-4 py-3">
                <p class="text-sm font-semibold text-ink">Variantes vendibles</p>
                <p class="mt-0.5 font-mono text-[11px] leading-relaxed text-steel-500">
                  Precio de la variante = precio de sucursal + extra. Una variante necesita al menos
                  una receta para venderse, y al venderse descuenta sus insumos del inventario.
                </p>
                <p v-if="variants.length && !anyRecipe" class="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-warn-600">
                  <i class="pi pi-exclamation-triangle text-[10px]" /> Este plato aún no puede venderse: ninguna variante tiene receta.
                </p>
              </div>

              <p v-if="!variants.length" class="rounded-xl border border-dashed border-line py-8 text-center font-mono text-[12px] text-steel-400">
                Aún no hay variantes. Agrega una (p. ej. “Estándar”). Nace inactiva hasta tener receta.
              </p>

              <VariantCard
                v-for="vr in variants"
                :key="vr.id"
                :product-id="(productId as string)"
                :variant="vr"
                :base-price="basePrice"
                :can-remove="variants.length > 1"
                @remove="removeVariant(vr)"
                @create-insumo="showInsumo = true"
              />

              <button
                type="button"
                :disabled="addingVariant"
                class="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 font-mono text-[12px] text-steel-600 transition hover:border-ember/40 hover:bg-ember-50/40 hover:text-ember-600 disabled:opacity-40"
                @click="addVariant"
              >
                <i class="pi pi-plus text-[11px]" /> Agregar otra variante
              </button>
            </div>
            <div v-else class="grid place-items-center rounded-xl border border-dashed border-line p-8 text-center">
              <div class="flex max-w-xs flex-col items-center gap-1.5 text-steel-400">
                <i class="pi pi-book text-2xl" />
                <p class="font-mono text-[12px]">Primero guarda el plato con su nombre, categoría y precio. Luego podrás construir sus variantes y recetas aquí.</p>
              </div>
            </div>
          </div>

          <!-- Footer: sticky -->
          <footer class="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-paper px-6 py-4 sm:px-8">
            <button
              v-if="!isNew && canManage"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-[12px] text-alert-600 transition hover:bg-alert/8"
              @click="remove"
            >
              <i class="pi pi-trash text-[11px]" /> Eliminar plato
            </button>
            <div class="ml-auto flex items-center gap-2">
              <button type="button" class="rounded-lg px-4 py-2.5 text-sm font-medium text-steel-600 transition hover:bg-sunken" @click="tryClose">Cerrar</button>
              <button
                type="button"
                :disabled="!canSave || saving"
                class="inline-flex items-center gap-2 rounded-lg bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-600 disabled:opacity-40"
                :class="dirty && 'ring-2 ring-ember/35 ring-offset-2 ring-offset-paper'"
                @click="save"
              >
                <i class="pi pi-check text-xs" /> {{ isNew ? 'Crear plato' : 'Guardar cambios' }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>

    <CreateInsumoModal v-if="showInsumo" @close="showInsumo = false" @created="onInsumoCreated" />
  </Teleport>
</template>
