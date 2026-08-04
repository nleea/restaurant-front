<script setup lang="ts">
// The dish-detail screen as the customer would see it, laid out per the admin's dishDetail config
// (ordered, toggleable sections). Data is real: variants + recipe (for the removable ingredients)
// + addons are loaded on demand for the opened product. The removable list is DERIVED from the
// recipe and is exclude-only — there is no add/quantity control here; adding lives in the addons
// lane. Selections are illustrative local state (going back to the carta preserves the carta).
import { computed, ref, watch } from 'vue'
import { removableIngredientsFor } from '@/lib/menuAppearance'
import { formatCOP } from '@/lib/money'
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import { useMenuStore } from '@/stores/menu'
import type { Addon } from '@/services/menu.api'

const props = defineProps<{ productId: string }>()

const appearance = useMenuAppearanceStore()
const menu = useMenuStore()

const product = computed(() => menu.products.find((p) => p.id === props.productId) ?? null)
const priceLabel = computed(() => formatCOP(menu.priceByProductId[props.productId] ?? '') || 'Sin precio')

// Visible sections in configured order.
const sections = computed(() => appearance.dishDetail.sections.filter((s) => s.visible))

// --- On-demand data for the opened product --------------------------------------------------
const productAddons = ref<Addon[]>([])
const loading = ref(false)

const variants = computed(() => menu.variantsByProductId[props.productId] ?? [])
const primaryVariant = computed(() => variants.value.find((v) => v.is_active) ?? variants.value[0] ?? null)
const removable = computed(() =>
  removableIngredientsFor(
    primaryVariant.value ? menu.recipeItemsByVariantId[primaryVariant.value.id] : [],
    menu.ingredientName,
    menu.isIngredientRemovable,
  ),
)

// Illustrative local selections (reset when the product changes).
const excluded = ref<Set<string>>(new Set())
const note = ref('')

async function loadProduct(id: string): Promise<void> {
  loading.value = true
  excluded.value = new Set()
  note.value = ''
  try {
    if (!menu.variantsByProductId[id]) await menu.loadVariants(id)
    const v = (menu.variantsByProductId[id] ?? []).find((x) => x.is_active) ?? menu.variantsByProductId[id]?.[0]
    if (v && !menu.recipeItemsByVariantId[v.id]) await menu.loadRecipeItems(v.id)
    productAddons.value = await menu.listProductAddons(id)
  } catch {
    productAddons.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.productId, (id) => id && loadProduct(id), { immediate: true })

function toggleExcluded(name: string): void {
  const next = new Set(excluded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  excluded.value = next
}
</script>

<template>
  <div v-if="product" class="pb-6">
    <template v-for="s in sections" :key="s.id">
      <!-- Photo -->
      <div v-if="s.id === 'photo'" class="h-44 w-full">
        <img v-if="product.image_url" :src="product.image_url" alt="" class="h-full w-full object-cover" />
        <div v-else class="grid h-full w-full place-items-center" :style="{ background: 'linear-gradient(135deg, var(--menu-primary), var(--menu-secondary))' }">
          <span class="text-2xl font-bold text-white/90">{{ product.name.slice(0, 2).toUpperCase() }}</span>
        </div>
      </div>

      <!-- Name + price always ride with the description block header -->
      <div v-else-if="s.id === 'description'" class="px-4 pt-4">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-[18px] font-bold leading-tight">{{ product.name }}</h2>
          <span class="shrink-0 text-[15px] font-bold" :style="{ color: 'var(--menu-secondary)' }">{{ priceLabel }}</span>
        </div>
        <p v-if="product.description" class="mt-1.5 text-[13px] opacity-70">{{ product.description }}</p>
      </div>

      <!-- Variants -->
      <div v-else-if="s.id === 'variants'" class="px-4 pt-4">
        <p class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide opacity-55">Presentación</p>
        <div v-if="variants.length" class="flex flex-wrap gap-2">
          <span
            v-for="v in variants"
            :key="v.id"
            class="rounded-full border px-3 py-1 text-[12px]"
            :style="{ borderColor: 'color-mix(in oklab, var(--menu-text) 20%, transparent)' }"
          >
            {{ v.name || product.name }}
          </span>
        </div>
        <p v-else class="text-[12px] opacity-45">Sin variantes.</p>
      </div>

      <!-- Addons: the priced "add" lane -->
      <div v-else-if="s.id === 'addons'" class="px-4 pt-4">
        <p class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide opacity-55">Adiciones</p>
        <div v-if="productAddons.length" class="flex flex-col gap-1.5">
          <label v-for="a in productAddons" :key="a.id" class="flex items-center justify-between gap-2 text-[13px]">
            <span class="flex items-center gap-2">
              <i class="pi pi-plus-circle text-[12px]" :style="{ color: 'var(--menu-accent)' }" />
              {{ a.name }}
            </span>
            <span class="opacity-70">+{{ formatCOP(a.price) }}</span>
          </label>
        </div>
        <p v-else class="text-[12px] opacity-45">Este plato no tiene adiciones.</p>
      </div>

      <!-- Remove: derived from the recipe, exclude-only (no quantity / no add) -->
      <div v-else-if="s.id === 'remove'" class="px-4 pt-4">
        <p class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide opacity-55">Quitar ingredientes</p>
        <div v-if="removable.length" class="flex flex-col gap-1.5">
          <button
            v-for="name in removable"
            :key="name"
            type="button"
            class="flex items-center gap-2 text-left text-[13px]"
            @click="toggleExcluded(name)"
          >
            <span
              class="grid size-4 shrink-0 place-items-center rounded border"
              :style="{ borderColor: 'color-mix(in oklab, var(--menu-text) 30%, transparent)' }"
            >
              <i v-if="!excluded.has(name)" class="pi pi-check text-[9px]" :style="{ color: 'var(--menu-accent)' }" />
            </span>
            <span :class="excluded.has(name) ? 'line-through opacity-45' : ''">{{ name }}</span>
          </button>
        </div>
        <p v-else class="text-[12px] opacity-45">Este plato no tiene ingredientes que se puedan quitar.</p>
      </div>

      <!-- Note -->
      <div v-else-if="s.id === 'note'" class="px-4 pt-4">
        <p class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide opacity-55">Nota para la cocina</p>
        <textarea
          v-model="note"
          rows="2"
          placeholder="Ej. sin picante, término medio…"
          class="w-full resize-none rounded-lg border bg-transparent px-2.5 py-2 text-[13px] focus:outline-none"
          :style="{ borderColor: 'color-mix(in oklab, var(--menu-text) 18%, transparent)' }"
        />
      </div>
    </template>

    <!-- Add-to-cart CTA (illustrative) -->
    <div class="px-4 pt-5">
      <div class="rounded-full py-2.5 text-center text-[14px] font-semibold text-white" :style="{ backgroundColor: 'var(--menu-primary)' }">
        Agregar · {{ priceLabel }}
      </div>
    </div>
  </div>

  <div v-else class="grid h-full place-items-center px-6 text-center text-[13px] opacity-60">
    {{ loading ? 'Cargando plato…' : 'Selecciona un plato para ver el detalle.' }}
  </div>
</template>
