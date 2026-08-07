<script setup lang="ts">
// The full menu: products grouped by category, each an anchored section (so featured-category chips
// can scroll to it). The card style comes from the appearance config (dishCard) — list/hero stack in
// one column, card/grid lay out as tiles — so /store matches the appearance preview.
import { computed } from 'vue'
import type { StorefrontCategory, StorefrontProduct } from '@/lib/storefront'
import type { DishCardConfig } from '@/lib/menuAppearance'
import { DEFAULT_DISH_CARD } from '@/lib/menuAppearance'
import ProductCard from '@/components/storefront/ProductCard.vue'

const props = defineProps<{
  groups: { category: StorefrontCategory; products: StorefrontProduct[] }[]
  card?: DishCardConfig
}>()
const emit = defineEmits<{
  (e: 'open', product: StorefrontProduct): void
  (e: 'add', product: StorefrontProduct): void
}>()

const style = computed(() => (props.card ?? DEFAULT_DISH_CARD).style)
// list/hero read as a full-width vertical stack; card/grid tile into columns.
const layoutClass = computed(() =>
  style.value === 'grid' || style.value === 'card'
    ? 'grid grid-cols-2 gap-3 lg:grid-cols-3'
    : 'flex flex-col gap-3',
)
</script>

<template>
  <section class="flex flex-col gap-7 px-4">
    <div v-for="g in groups" :id="`sf-cat-${g.category.id}`" :key="g.category.id" class="scroll-mt-4">
      <h2 class="mb-3 text-lg font-bold text-[var(--sf-text)]">{{ g.category.name }}</h2>
      <div :class="layoutClass">
        <ProductCard
          v-for="p in g.products"
          :key="p.id"
          :product="p"
          :card="card"
          @open="emit('open', p)"
          @add="emit('add', p)"
        />
      </div>
    </div>
    <p v-if="!groups.length" class="rounded-2xl border border-dashed border-[var(--sf-line)] py-12 text-center text-[13px] text-[var(--sf-muted)]">
      No encontramos platos con esa búsqueda.
    </p>
  </section>
</template>
