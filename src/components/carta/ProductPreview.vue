<script setup lang="ts">
// Read-only product preview — the master-detail companion to the Productos list. Shows a dish the
// way you'd want to glance at it before editing: hero photo, description, base price, its sellable
// variants (each with its orderable price + a "sin receta" flag), and the food-cost/margin meter
// for the selected variant. Variants + their recipes load on demand when the product changes.
import { computed, ref, watch } from 'vue'
import type { Product } from '@/services/menu.api'
import { useMenuStore } from '@/stores/menu'
import { formatCOP } from '@/lib/money'
import FoodCostMeter from '@/components/carta/FoodCostMeter.vue'
import StationsPanel from '@/components/carta/StationsPanel.vue'

const props = defineProps<{ product: Product; canManage: boolean }>()
const emit = defineEmits<{ (e: 'edit'): void; (e: 'close'): void }>()

const menu = useMenuStore()

const loadingVariants = ref(false)
// Which variant the food-cost meter reflects (a product can have several).
const selectedVariantId = ref<string | null>(null)

const variants = computed(() => menu.variantsByProductId[props.product.id] ?? [])
const basePrice = computed(() => menu.priceByProductId[props.product.id] ?? null)
const categoryName = computed(() => menu.categoryName(props.product.category_id))

// Orderable price of a variant = product's active-branch price + the variant's extra_price.
function variantPrice(extra: string): number {
  return Number(basePrice.value ?? 0) + Number(extra)
}

const selectedVariant = computed(
  () => variants.value.find((v) => v.id === selectedVariantId.value) ?? variants.value[0] ?? null,
)

// Meter inputs for the selected variant (honest partial/unpriced handled inside FoodCostMeter).
const meter = computed(() => {
  const v = selectedVariant.value
  if (!v) return { cost: 0, price: 0, margin: 0, partial: false }
  const price = variantPrice(v.extra_price)
  const { total, partial } = menu.recipeCost(v.id)
  return { cost: total, price, margin: price - total, partial }
})

// Load the product's variants + their recipes when the selection changes.
watch(
  () => props.product.id,
  async (id) => {
    loadingVariants.value = true
    selectedVariantId.value = null
    try {
      await menu.loadVariants(id)
      const vs = menu.variantsByProductId[id] ?? []
      await menu.loadRecipeItemsForVariants(vs.map((v) => v.id))
      // Prefer the first active variant for the meter.
      selectedVariantId.value = (vs.find((v) => v.is_active) ?? vs[0])?.id ?? null
    } finally {
      loadingVariants.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <article class="card overflow-hidden">
    <!-- Hero: photo or monogram, with a back/close affordance -->
    <div class="relative grid h-40 place-items-center overflow-hidden bg-pass">
      <img v-if="product.image_url" :src="product.image_url" class="size-full object-cover" alt="" />
      <span v-else class="font-display text-5xl font-bold text-steel-300">{{ product.name.charAt(0) || '·' }}</span>
      <button
        type="button"
        class="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-graphite-900/70 text-paper backdrop-blur transition hover:bg-graphite-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
        :aria-label="'Cerrar vista previa'"
        @click="emit('close')"
      >
        <i class="pi pi-arrow-left text-xs lg:hidden" />
        <i class="pi pi-times text-xs max-lg:hidden" />
      </button>
      <span
        class="absolute right-3 top-3 pill"
        :class="product.is_active ? 'pill-success' : 'pill-neutral'"
      >
        {{ product.is_active ? 'En venta' : 'Oculto' }}
      </span>
    </div>

    <div class="flex flex-col gap-4 p-4">
      <!-- Identity -->
      <div>
        <p class="eyebrow">{{ categoryName ?? 'Sin categoría' }}</p>
        <h3 class="mt-1 font-display text-xl font-bold leading-tight text-ink">{{ product.name || 'Sin nombre' }}</h3>
        <p class="mt-1 text-[13px] leading-relaxed" :class="product.description ? 'text-muted' : 'text-steel-400'">
          {{ product.description || 'Sin descripción' }}
        </p>
      </div>

      <!-- Base price -->
      <div class="flex items-baseline justify-between border-t border-hairline pt-3">
        <span class="eyebrow">Precio base</span>
        <span class="font-mono text-lg font-bold tabular-nums" :class="basePrice ? 'text-ink' : 'text-steel-400'">
          {{ basePrice ? formatCOP(basePrice) : 'Sin precio' }}
        </span>
      </div>

      <!-- Variants -->
      <div class="flex flex-col gap-2">
        <p class="eyebrow">Variantes {{ variants.length ? `· ${variants.length}` : '' }}</p>
        <p v-if="loadingVariants" class="font-mono text-[11px] text-steel-400">Cargando variantes…</p>
        <p v-else-if="!variants.length" class="rounded-lg border border-dashed border-line px-3 py-2 font-mono text-[11px] text-steel-400">
          Este producto no tiene variantes.
        </p>
        <button
          v-for="v in variants"
          v-else
          :key="v.id"
          type="button"
          class="flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          :class="v.id === selectedVariant?.id ? 'border-ember bg-ember-50' : 'border-line bg-surface hover:bg-sunken/50'"
          @click="selectedVariantId = v.id"
        >
          <span class="min-w-0 flex-1 truncate text-[13px] text-ink">{{ v.name || 'Único' }}</span>
          <span v-if="!menu.hasRecipe(v.id)" class="pill pill-warn shrink-0">sin receta</span>
          <span v-if="!v.is_active" class="pill pill-neutral shrink-0">oculta</span>
          <span class="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-ink">{{ formatCOP(variantPrice(v.extra_price)) }}</span>
        </button>
      </div>

      <!-- Quién lo prepara. Va junto a las variantes porque decide si se pueden vender. -->
      <StationsPanel :product-id="product.id" />

      <!-- Margin meter for the selected variant -->
      <FoodCostMeter
        v-if="selectedVariant"
        :cost="meter.cost"
        :price="meter.price"
        :margin="meter.margin"
        :partial="meter.partial"
      />

      <!-- Edit -->
      <button
        v-if="canManage"
        type="button"
        class="inline-flex items-center justify-center gap-2 rounded-xl bg-graphite-900 px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-graphite-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        @click="emit('edit')"
      >
        <i class="pi pi-pencil text-xs" /> Editar producto
      </button>
    </div>
  </article>
</template>
