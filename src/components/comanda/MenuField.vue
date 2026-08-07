<script setup lang="ts">
// The menu field: a sticky search + mono category rail over a grid of product
// tiles. Tapping a tile emits `add` with a variant id; the parent stamps the line
// onto the dupe via the real orders store. Only orderable products are offered —
// a product needs an active-branch price AND at least one active variant.
import { computed, ref } from 'vue'
import ProductTile from './ProductTile.vue'
import { useMenuStore } from '@/stores/menu'
import { useOrdersStore } from '@/stores/orders'

const emit = defineEmits<{ add: [variantId: string] }>()

const menu = useMenuStore()
const orders = useOrdersStore()

interface TileVariant {
  id: string
  /** Size label shown in the popover; '' for a single-variant tile that stamps on tap. */
  label: string
  price: number
}
interface Tile {
  id: string
  name: string
  categoryId: string
  tag: string
  variants: TileVariant[]
}

// Mono two-letter tag derived from the category name (e.g. "Carnes" → "CA"). Not colored.
function tagOf(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, '')
  return (letters.slice(0, 2) || '··').toUpperCase()
}

const catTag = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const c of menu.categories) map[c.id] = tagOf(c.name)
  return map
})

// Orderable = has an active-branch price AND at least one active variant. A variant's
// unit price comes from the store's variant index (branch price + variant extra).
const tiles = computed<Tile[]>(() =>
  menu.products
    .filter(
      (p) =>
        menu.priceByProductId[p.id] != null &&
        (menu.variantsByProductId[p.id] ?? []).some((v) => v.is_active),
    )
    .map((p) => {
      const active = (menu.variantsByProductId[p.id] ?? []).filter((v) => v.is_active)
      const single = active.length === 1
      const variants: TileVariant[] = active.map((v) => ({
        id: v.id,
        label: single || !v.name || v.name === 'Estándar' ? '' : v.name,
        price: orders.variantIndex[v.id]?.unitPrice ?? 0,
      }))
      return {
        id: p.id,
        name: p.name,
        categoryId: p.category_id,
        tag: catTag.value[p.category_id] ?? '··',
        variants,
      }
    }),
)

// Only rail categories that actually have an orderable tile.
const usedCategoryIds = computed(() => new Set(tiles.value.map((t) => t.categoryId)))
const cats = computed(() => menu.categories.filter((c) => usedCategoryIds.value.has(c.id)))

const search = ref('')
const activeCat = ref<string>('all')

const filtered = computed(() =>
  tiles.value.filter((t) => {
    if (activeCat.value !== 'all' && t.categoryId !== activeCat.value) return false
    const q = search.value.trim().toLowerCase()
    return q === '' || t.name.toLowerCase().includes(q)
  }),
)
</script>

<template>
  <div class="flex min-h-full flex-col">
    <!-- Sticky search + category rail -->
    <div class="sticky top-0 z-10 border-b border-line bg-app/90 pb-2 pt-1 backdrop-blur-md supports-[backdrop-filter]:bg-app/70">
      <div class="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3">
        <i class="pi pi-search text-sm text-steel-400" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          placeholder="Buscar plato…"
          aria-label="Buscar plato"
          class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-steel-400"
        />
        <button
          v-if="search"
          type="button"
          class="grid size-6 place-items-center text-steel-400 hover:text-ink"
          aria-label="Limpiar búsqueda"
          @click="search = ''"
        >
          <i class="pi pi-times text-xs" />
        </button>
      </div>

      <div v-if="cats.length" class="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        <button
          type="button"
          class="min-h-9 shrink-0 rounded-full px-4 font-mono text-[12px] transition"
          :class="activeCat === 'all' ? 'bg-graphite-900 text-white' : 'border border-line bg-surface text-steel-600 hover:border-steel-400'"
          @click="activeCat = 'all'"
        >
          Todo
        </button>
        <button
          v-for="c in cats"
          :key="c.id"
          type="button"
          class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-4 font-mono text-[12px] transition"
          :class="activeCat === c.id ? 'bg-graphite-900 text-white' : 'border border-line bg-surface text-steel-600 hover:border-steel-400'"
          @click="activeCat = c.id"
        >
          <span class="text-[10px] font-bold tracking-widest" :class="activeCat === c.id ? 'text-steel-300' : 'text-steel-400'">{{ catTag[c.id] }}</span>
          {{ c.name }}
        </button>
      </div>
    </div>

    <!-- No orderable products at all -->
    <p
      v-if="!tiles.length"
      class="mt-3 rounded-xl border border-dashed border-line py-12 text-center font-mono text-[12px] text-steel-400"
    >
      No hay productos vendibles. Necesitan precio de sucursal y al menos una variante activa.
    </p>

    <template v-else>
      <!-- Tile grid -->
      <div class="grid grid-cols-2 gap-2.5 pt-3 sm:grid-cols-3 xl:grid-cols-4">
        <ProductTile
          v-for="p in filtered"
          :key="p.id"
          :product="p"
          :tag="p.tag"
          @add="(vid) => emit('add', vid)"
        />
      </div>

      <p
        v-if="!filtered.length"
        class="mt-3 rounded-xl border border-dashed border-line py-12 text-center font-mono text-[12px] text-steel-400"
      >
        Ningún plato coincide con “{{ search }}”.
      </p>
    </template>
  </div>
</template>
