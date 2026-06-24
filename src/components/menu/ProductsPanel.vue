<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { useBranchStore } from '@/stores/branch'
import { formatCOP } from '@/lib/money'
import ProductDetail from '@/components/menu/ProductDetail.vue'
import type { Category, Product } from '@/services/menu.api'

const auth = useAuthStore()
const menu = useMenuStore()
const branch = useBranchStore()
const canManage = computed(() => auth.can('menu.manage'))

const error = ref<string | null>(null)
const loading = ref(false)

// Canvas filters: free-text search, active-category chip, and inactive visibility.
const q = ref('')
const activeCategoryId = ref<string | null>(null)
const showInactive = ref(false)

// Edit drawer.
const selectedId = ref<string | null>(null)
const drawerOpen = ref(false)
const selected = computed<Product | null>(
  () => menu.products.find((p) => p.id === selectedId.value) ?? null,
)

// Create dialog.
const showCreate = ref(false)
const fName = ref('')
const fCategoryId = ref<string | null>(null)
const fDescription = ref('')
const fImageUrl = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

onMounted(async () => {
  branch.ensureLoaded()
  loading.value = true
  try {
    await Promise.all([menu.fetchCategories(), menu.fetchProducts(), menu.fetchAddons()])
    if (branch.activeBranchId) await menu.loadPrices(branch.activeBranchId)
  } catch {
    error.value = 'No se pudo cargar la carta.'
  } finally {
    loading.value = false
  }
})

const categoryOptions = computed(() => menu.categories.map((c) => ({ label: c.name, value: c.id })))

function productsInCategory(categoryId: string): Product[] {
  const needle = q.value.trim().toLowerCase()
  return menu.products.filter(
    (p) =>
      p.category_id === categoryId &&
      (showInactive.value || p.is_active) &&
      (needle === '' || p.name.toLowerCase().includes(needle)),
  )
}

// Show categories that match the chip filter. While searching, hide empty sections; otherwise
// keep them so the worker can fill in a category that has no dishes yet.
const visibleCategories = computed<Category[]>(() => {
  const searching = q.value.trim() !== ''
  return menu.categories.filter(
    (c) =>
      (activeCategoryId.value === null || c.id === activeCategoryId.value) &&
      (!searching || productsInCategory(c.id).length > 0),
  )
})

const totalVisible = computed(() =>
  visibleCategories.value.reduce((n, c) => n + productsInCategory(c.id).length, 0),
)

function priceInfo(product: Product): { text: string; muted: boolean } {
  if (!branch.hasActiveBranch) return { text: '—', muted: true }
  if (!menu.pricesLoaded) return { text: '···', muted: true }
  const value = menu.priceByProductId[product.id]
  if (value === null || value === undefined) return { text: 'Sin precio', muted: true }
  return { text: formatCOP(value), muted: false }
}

function openProduct(product: Product) {
  selectedId.value = product.id
  drawerOpen.value = true
}

async function onDrawerHide() {
  const id = selectedId.value
  if (id && branch.activeBranchId) await menu.refreshPrice(id, branch.activeBranchId)
  selectedId.value = null
}

function openCreate(categoryId?: string) {
  fName.value = ''
  fCategoryId.value = categoryId ?? menu.categories[0]?.id ?? null
  fDescription.value = ''
  fImageUrl.value = ''
  createError.value = null
  showCreate.value = true
}

async function submitCreate() {
  if (!fName.value.trim() || !fCategoryId.value) return
  creating.value = true
  createError.value = null
  try {
    const prod = await menu.createProduct({
      category_id: fCategoryId.value,
      name: fName.value.trim(),
      description: fDescription.value.trim() || null,
      image_url: fImageUrl.value.trim() || null,
    })
    showCreate.value = false
    openProduct(prod) // continue into the new dish to set its price and addons
  } catch {
    createError.value = 'No se pudo crear el plato.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="relative min-w-[12rem] flex-1">
        <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-steel-500" />
        <InputText v-model="q" placeholder="Buscar plato…" class="w-full !pl-9" />
      </div>
      <label class="flex shrink-0 items-center gap-2 text-xs text-steel-500">
        <input type="checkbox" v-model="showInactive" class="size-3.5 accent-ember" />
        Mostrar inactivos
      </label>
      <Button
        v-if="canManage"
        label="Nuevo plato"
        icon="pi pi-plus"
        class="shrink-0"
        :disabled="menu.categories.length === 0"
        @click="openCreate()"
      />
    </div>

    <!-- Category chips -->
    <div v-if="menu.categories.length" class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button
        type="button"
        class="shrink-0 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
        :class="activeCategoryId === null ? 'border-graphite-900 bg-graphite-900 text-paper' : 'border-line text-steel-500 hover:text-ink'"
        @click="activeCategoryId = null"
      >
        Todas
      </button>
      <button
        v-for="cat in menu.categories"
        :key="cat.id"
        type="button"
        class="shrink-0 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
        :class="activeCategoryId === cat.id ? 'border-graphite-900 bg-graphite-900 text-paper' : 'border-line text-steel-500 hover:text-ink'"
        @click="activeCategoryId = cat.id"
      >
        {{ cat.name }}
      </button>
    </div>

    <p v-if="!branch.hasActiveBranch" class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500">
      Precios ocultos — configura una sucursal (<code>VITE_DEFAULT_BRANCH_ID</code>) para fijarlos.
    </p>
    <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>

    <!-- States -->
    <div v-if="loading" class="text-steel-500">Cargando la carta…</div>

    <div
      v-else-if="menu.categories.length === 0"
      class="rounded-xl border border-dashed border-line px-6 py-12 text-center"
    >
      <p class="font-display text-lg font-extrabold text-ink">La carta está en blanco</p>
      <p class="mt-1 text-sm text-steel-500">
        Crea una categoría (Entradas, Principales, Bebidas…) para empezar a montar los platos.
      </p>
    </div>

    <p
      v-else-if="totalVisible === 0"
      class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-steel-500"
    >
      Ningún plato coincide con la búsqueda.
    </p>

    <!-- The carta: category sections of dotted-leader line items -->
    <section v-for="cat in visibleCategories" v-else :key="cat.id" class="flex flex-col gap-2.5">
      <header class="flex items-center gap-3">
        <span class="size-1.5 rounded-[2px] bg-ember" aria-hidden="true" />
        <h3 class="font-display text-lg font-extrabold leading-none text-ink">{{ cat.name }}</h3>
        <span class="h-px flex-1 bg-line" aria-hidden="true" />
        <span class="font-mono text-[11px] text-steel-500">
          {{ productsInCategory(cat.id).length }}
          {{ productsInCategory(cat.id).length === 1 ? 'plato' : 'platos' }}
        </span>
      </header>

      <p
        v-if="productsInCategory(cat.id).length === 0"
        class="rounded-lg border border-dashed border-line px-3.5 py-3 text-[13px] text-steel-500"
      >
        Sin platos aquí todavía.
        <button v-if="canManage" type="button" class="font-medium text-ember hover:underline" @click="openCreate(cat.id)">
          Añade el primero.
        </button>
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="prod in productsInCategory(cat.id)" :key="prod.id">
          <button
            type="button"
            class="group flex w-full items-center gap-3.5 rounded-xl border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="prod.is_active ? '' : 'opacity-60'"
            @click="openProduct(prod)"
          >
            <span class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-app text-ember">
              <img v-if="prod.image_url" :src="prod.image_url" class="size-full object-cover" alt="" />
              <span v-else class="font-display text-lg font-extrabold">{{ prod.name.charAt(0).toUpperCase() }}</span>
            </span>

            <span class="min-w-0 flex-1">
              <span class="flex items-baseline gap-2.5">
                <span class="truncate font-display text-[15px] font-bold text-ink">{{ prod.name }}</span>
                <span
                  class="h-0 flex-1 -translate-y-[2px] border-b border-dotted border-line transition-colors group-hover:border-ember/50"
                  aria-hidden="true"
                />
                <span
                  class="shrink-0 font-mono text-sm tabular-nums transition-colors"
                  :class="priceInfo(prod).muted ? 'text-steel-500' : 'font-medium text-ink group-hover:text-ember'"
                >
                  {{ priceInfo(prod).text }}
                </span>
              </span>
              <span class="mt-0.5 flex items-center gap-2">
                <span v-if="prod.description" class="truncate text-[13px] text-steel-500">{{ prod.description }}</span>
                <span
                  v-if="!prod.is_active"
                  class="shrink-0 rounded-full bg-app px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-steel-500"
                >
                  Inactivo
                </span>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Edit drawer: the focused workspace for one dish -->
    <Drawer
      v-model:visible="drawerOpen"
      position="right"
      :style="{ width: '460px', maxWidth: '100vw' }"
      :pt="{ content: { class: '!p-0' } }"
      @hide="onDrawerHide"
    >
      <template #header>
        <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Editar plato</span>
      </template>
      <ProductDetail v-if="selected" :key="selected.id" :product="selected" @back="drawerOpen = false" />
    </Drawer>

    <!-- Create dialog -->
    <Dialog
      v-model:visible="showCreate"
      modal
      header="Nuevo plato"
      :style="{ width: '28rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="p-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="p-name" v-model="fName" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="p-cat" class="text-xs font-medium uppercase tracking-wide text-steel-500">Categoría</label>
          <Select
            id="p-cat"
            v-model="fCategoryId"
            :options="categoryOptions"
            option-label="label"
            option-value="value"
            placeholder="Elige una categoría"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="p-desc" class="text-xs font-medium uppercase tracking-wide text-steel-500">Descripción (opcional)</label>
          <Textarea id="p-desc" v-model="fDescription" rows="2" auto-resize fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="p-img" class="text-xs font-medium uppercase tracking-wide text-steel-500">URL de imagen (opcional)</label>
          <InputText id="p-img" v-model="fImageUrl" fluid />
        </div>
        <p v-if="createError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ createError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showCreate = false" />
        <Button label="Crear" :loading="creating" :disabled="!fName.trim() || !fCategoryId" @click="submitCreate" />
      </template>
    </Dialog>
  </div>
</template>
