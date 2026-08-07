<script setup lang="ts">
// Carta — the menu-management station, backed by the production menu store + real backend.
// Productos · Categorías · Adiciones. The product editor is a full-screen costing bench; the
// recipe is the hero and the food-cost meter the one heat-carrying signal.
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import ProductEditorModal from '@/components/carta/ProductEditorModal.vue'
import ProductPreview from '@/components/carta/ProductPreview.vue'
import CategoriesTab from '@/components/carta/CategoriesTab.vue'
import AdditionsTab from '@/components/carta/AdditionsTab.vue'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { useKitchenStore } from '@/stores/kitchen'
import { useBranchStore } from '@/stores/branch'
import { useCatalogStore } from '@/stores/catalog'
import { formatCOP } from '@/lib/money'
import type { Product } from '@/services/menu.api'

const auth = useAuthStore()
const menu = useMenuStore()
const kitchen = useKitchenStore()
const branch = useBranchStore()
const catalog = useCatalogStore()
const canManage = computed(() => auth.can('menu.manage'))

type Tab = 'productos' | 'categorias' | 'adiciones'
const tab = ref<Tab>('productos')
const TABS: { key: Tab; label: string }[] = [
  { key: 'productos', label: 'Productos' },
  { key: 'categorias', label: 'Categorías' },
  { key: 'adiciones', label: 'Adiciones' },
]

// Toolbar
const search = ref('')
const view = ref<'list' | 'cards'>('list')
const activeCat = ref<string>('all')
const loading = ref(true)
const error = ref<string | null>(null)

function tagOf(name: string): string {
  return name.slice(0, 2).toUpperCase() || '··'
}
function priceLabel(id: string): string {
  const p = menu.priceByProductId[id]
  return p ? formatCOP(p) : 'Sin precio'
}

const filtered = computed(() =>
  menu.products.filter((p) => {
    if (activeCat.value !== 'all' && p.category_id !== activeCat.value) return false
    const q = search.value.trim().toLowerCase()
    return (
      q === '' ||
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q)
    )
  }),
)
// Grouped by category (list view), in category order.
const grouped = computed(() =>
  menu.categories
    .map((c) => ({ cat: c, items: filtered.value.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.items.length > 0),
)

// Menu-wide stock-guard leak banner: active variants selling without a recipe.
const missing = computed(() => menu.variantsMissingRecipe)
// Y el que impide cocinar del todo: platos que ninguna estación prepara. Se ordenan con los que
// ya se están vendiendo delante, porque ésos son los que tienen un cliente esperando.
const unroutable = computed(() => kitchen.unroutableProducts)

// Master-detail: selecting a product opens a read-only preview beside the list (a full-screen drawer
// below lg). Editing is a deliberate second step (the preview's "Editar" button, or "Nuevo").
const selectedProductId = ref<string | null>(null)
const selectedProduct = computed(
  () => menu.products.find((p) => p.id === selectedProductId.value) ?? null,
)
function selectProduct(p: Product) {
  selectedProductId.value = p.id
}
function editSelected() {
  if (selectedProduct.value) openEdit(selectedProduct.value)
}

// Editor
const editorOpen = ref(false)
const editingProduct = ref<Product | null>(null)
function openEdit(p: Product) {
  editingProduct.value = p
  editorOpen.value = true
}
function openNew() {
  editingProduct.value = null
  editorOpen.value = true
}
async function onSaved() {
  // Store mutations already refetched products; refresh the price cache + missing-recipe banner.
  if (branch.activeBranchId) await menu.loadPrices(branch.activeBranchId)
  // Las dos bandas se rehacen: guardar un plato puede haber resuelto —o creado— cualquiera de
  // los dos huecos.
  await Promise.all([menu.loadVariantsMissingRecipe(), kitchen.loadUnroutableProducts()])
}

async function loadAll() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    await Promise.all([
      menu.fetchCategories(),
      menu.fetchProducts(),
      menu.fetchAddons(),
      menu.fetchIngredients(),
      catalog.units.length ? Promise.resolve() : catalog.fetchUnits(),
      menu.loadIngredientCosts(),
      menu.loadVariantsMissingRecipe(),
      kitchen.loadUnroutableProducts(),
    ])
    if (branch.activeBranchId) {
      await menu.loadPrices(branch.activeBranchId)
      // Las estaciones de la sede: sin ellas el selector del panel sale vacío y parece roto.
      await kitchen.loadStations(branch.activeBranchId)
    }
  } catch {
    error.value = 'No se pudo cargar la carta.'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- Header -->
        <header class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Estación · Carta</p>
            <h1 class="mt-1 font-display text-hero font-bold text-ink">Carta</h1>
            <p class="text-steel-500">Productos, categorías y adiciones del menú.</p>
          </div>
          <button type="button" :disabled="loading" class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-steel-600 transition hover:bg-sunken disabled:opacity-50" @click="loadAll">
            <i class="pi pi-refresh text-[11px]" :class="loading && 'pi-spin'" /> Actualizar
          </button>
        </header>

        <p v-if="error" role="alert" class="rounded-xl border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert-600">{{ error }}</p>

        <!-- Tabs -->
        <nav class="flex gap-1.5">
          <button
            v-for="tb in TABS"
            :key="tb.key"
            type="button"
            class="rounded-lg px-5 py-2 text-sm font-semibold transition"
            :class="tab === tb.key ? 'bg-graphite-900 text-white' : 'border border-line bg-surface text-steel-600 hover:bg-sunken'"
            @click="tab = tb.key"
          >
            {{ tb.label }}
          </button>
        </nav>

        <!-- TAB · PRODUCTOS -->
        <template v-if="tab === 'productos'">
          <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <!-- LEFT: toolbar + list. Below lg it hides while a product preview is open. -->
          <div class="flex min-w-0 flex-col gap-4" :class="selectedProductId ? 'max-lg:hidden' : ''">
          <!-- Stock-guard leak banner -->
          <div v-if="missing.length" class="rounded-xl border border-warn/40 bg-warn/8 px-4 py-3">
            <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              <i class="pi pi-exclamation-triangle text-[12px] text-warn-600" />
              {{ missing.length }} {{ missing.length === 1 ? 'variante se vende' : 'variantes se venden' }} sin receta
            </p>
            <p class="mt-0.5 font-mono text-[11px] leading-relaxed text-steel-500">
              No descuentan inventario al venderse. Abre el plato y agrégales una receta:
              <span v-for="(m, i) in missing.slice(0, 6)" :key="m.product_variant_id" class="text-ink">
                {{ m.product_name }}<span v-if="m.variant_name"> · {{ m.variant_name }}</span><span v-if="i < Math.min(missing.length, 6) - 1" class="text-steel-300">, </span>
              </span><span v-if="missing.length > 6" class="text-steel-400"> …</span>
            </p>
          </div>

          <!-- Sin estación no cocina nadie. Va ANTES de la de recetas y en alerta y no en warn:
               una variante sin receta se vende y no descuenta inventario —un descuadre que se
               arregla después—; un plato sin estación se vende, se cobra y NO SE PREPARA, y eso
               se descubre con el cliente esperando. -->
          <div
            v-if="unroutable.length"
            class="rounded-xl border border-alert-400/50 bg-alert-50 px-4 py-3"
            data-missing-station
          >
            <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              <i class="pi pi-exclamation-circle text-[12px] text-alert-600" />
              {{ unroutable.length }}
              {{ unroutable.length === 1 ? 'plato no llega' : 'platos no llegan' }} a la cocina
            </p>
            <p class="mt-0.5 font-mono text-[11px] leading-relaxed text-steel-500">
              Sin estación asignada nadie los prepara: se venden, se cobran y la cocina nunca los
              ve. Abre el plato y asígnale una estación:
              <span v-for="(u, i) in unroutable.slice(0, 6)" :key="u.product_id" class="text-ink">
                {{ u.name
                }}<span v-if="u.active_variants" class="text-alert-600"> (vendiéndose)</span
                ><span v-if="i < Math.min(unroutable.length, 6) - 1" class="text-steel-300">, </span>
              </span><span v-if="unroutable.length > 6" class="text-steel-400"> …</span>
            </p>
          </div>

          <!-- Toolbar -->
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 sm:max-w-md">
              <i class="pi pi-search text-sm text-steel-400" />
              <input v-model="search" placeholder="Buscar plato…" class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-steel-400" />
              <button v-if="search" type="button" class="text-steel-400 hover:text-ink" @click="search = ''"><i class="pi pi-times text-xs" /></button>
            </div>
            <div class="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
              <button type="button" class="grid size-8 place-items-center rounded-md transition" :class="view === 'list' ? 'bg-graphite-900 text-white' : 'text-steel-500 hover:bg-sunken'" @click="view = 'list'"><i class="pi pi-bars text-xs" /></button>
              <button type="button" class="grid size-8 place-items-center rounded-md transition" :class="view === 'cards' ? 'bg-graphite-900 text-white' : 'text-steel-500 hover:bg-sunken'" @click="view = 'cards'"><i class="pi pi-th-large text-xs" /></button>
            </div>
            <button v-if="canManage" type="button" class="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-600" @click="openNew()">
              <i class="pi pi-plus text-xs" /> Nuevo producto
            </button>
          </div>

          <!-- Category filter pills (mono, not rainbow) -->
          <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <button type="button" class="shrink-0 rounded-full px-4 py-1.5 font-mono text-[12px] transition" :class="activeCat === 'all' ? 'bg-graphite-900 text-white' : 'border border-line bg-surface text-steel-600 hover:border-steel-400'" @click="activeCat = 'all'">Todas</button>
            <button
              v-for="c in menu.categories"
              :key="c.id"
              type="button"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 font-mono text-[12px] transition"
              :class="activeCat === c.id ? 'bg-graphite-900 text-white' : 'border border-line bg-surface text-steel-600 hover:border-steel-400'"
              @click="activeCat = c.id"
            >
              <span class="text-[9px] font-bold tracking-widest" :class="activeCat === c.id ? 'text-steel-300' : 'text-steel-400'">{{ tagOf(c.name) }}</span>{{ c.name }}
            </button>
          </div>

          <p v-if="loading" class="rounded-xl border border-dashed border-line py-12 text-center font-mono text-[12px] text-steel-400">Cargando carta…</p>

          <!-- LIST VIEW -->
          <div v-else-if="view === 'list'" class="flex flex-col gap-6">
            <section v-for="g in grouped" :key="g.cat.id">
              <div class="mb-2 flex items-center gap-2 border-b border-line pb-2">
                <span class="grid size-6 place-items-center rounded-md bg-graphite-900 font-mono text-[9px] font-bold tracking-wider text-white">{{ tagOf(g.cat.name) }}</span>
                <h2 class="font-display text-base font-bold text-ink">{{ g.cat.name }}</h2>
                <span class="font-mono text-[11px] text-steel-500">{{ g.items.length }} productos</span>
              </div>
              <div class="overflow-hidden rounded-xl border border-line bg-paper">
                <button
                  v-for="p in g.items"
                  :key="p.id"
                  type="button"
                  class="flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left transition last:border-b-0"
                  :class="selectedProductId === p.id ? 'bg-ember-50' : 'hover:bg-sunken/40'"
                  @click="selectProduct(p)"
                >
                  <span class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-sunken font-display text-sm font-bold text-steel-600">
                    <img v-if="p.image_url" :src="p.image_url" class="size-full object-cover" alt="" />
                    <template v-else>{{ p.name.charAt(0) || '·' }}</template>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-ink">{{ p.name || 'Sin nombre' }}</span>
                    <span class="block truncate font-mono text-[11px] text-steel-400">{{ p.description || 'Sin descripción' }}</span>
                  </span>
                  <span class="w-24 shrink-0 text-right font-mono text-sm font-semibold tabular-nums" :class="menu.priceByProductId[p.id] ? 'text-ink' : 'text-steel-400'">{{ priceLabel(p.id) }}</span>
                  <span
                    class="grid size-6 shrink-0 place-items-center rounded-full"
                    :class="p.is_active ? 'text-success-600' : 'text-steel-300'"
                    :title="p.is_active ? 'En venta' : 'Oculto'"
                  ><i class="pi text-xs" :class="p.is_active ? 'pi-check-circle' : 'pi-circle'" /></span>
                  <i class="pi pi-angle-right shrink-0 text-sm text-steel-400" />
                </button>
              </div>
            </section>
            <p v-if="!grouped.length" class="rounded-xl border border-dashed border-line py-12 text-center font-mono text-[12px] text-steel-400">
              Ningún plato coincide. Ajusta la búsqueda o crea uno nuevo.
            </p>
          </div>

          <!-- CARD VIEW -->
          <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              v-for="p in filtered"
              :key="p.id"
              type="button"
              class="card overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-md"
              :class="selectedProductId === p.id ? 'ring-2 ring-ember' : ''"
              @click="selectProduct(p)"
            >
              <div class="grid h-28 place-items-center overflow-hidden bg-pass">
                <img v-if="p.image_url" :src="p.image_url" class="size-full object-cover" alt="" />
                <span v-else class="font-display text-3xl font-bold text-steel-300">{{ p.name.charAt(0) || '·' }}</span>
              </div>
              <div class="flex flex-col gap-1.5 p-4">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-ink">{{ p.name || 'Sin nombre' }}</p>
                    <p class="font-mono text-[11px] text-steel-400">{{ tagOf(menu.categoryName(p.category_id) ?? '') }} · {{ menu.categoryName(p.category_id) ?? '—' }}</p>
                  </div>
                  <span class="grid size-5 shrink-0 place-items-center" :class="p.is_active ? 'text-success-600' : 'text-steel-300'"><i class="pi text-xs" :class="p.is_active ? 'pi-check-circle' : 'pi-circle'" /></span>
                </div>
                <div class="mt-1 flex items-center justify-between">
                  <span class="font-mono text-base font-bold tabular-nums" :class="menu.priceByProductId[p.id] ? 'text-ink' : 'text-steel-400'">{{ priceLabel(p.id) }}</span>
                </div>
              </div>
            </button>
          </div>
          </div>
          <!-- RIGHT: read-only preview (full-screen drawer below lg) -->
          <div class="lg:sticky lg:top-6 lg:self-start" :class="selectedProductId ? '' : 'max-lg:hidden'">
            <ProductPreview
              v-if="selectedProduct"
              :product="selectedProduct"
              :can-manage="canManage"
              @edit="editSelected"
              @close="selectedProductId = null"
            />
            <div v-else class="hidden min-h-[20rem] place-items-center p-8 text-center lg:grid card">
              <p class="font-mono text-[12px] leading-relaxed text-steel-400">
                <i class="pi pi-hand-pointer mb-2 block text-lg text-steel-300" />
                Selecciona un producto<br />para ver su vista previa.
              </p>
            </div>
          </div>
          </div>
        </template>

        <CategoriesTab v-else-if="tab === 'categorias'" />
        <AdditionsTab v-else />
      </div>
    </main>

    <ProductEditorModal
      v-if="editorOpen"
      :product="editingProduct"
      @close="editorOpen = false"
      @saved="onSaved"
    />
  </AppShell>
</template>
