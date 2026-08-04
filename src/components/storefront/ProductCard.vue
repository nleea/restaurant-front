<script setup lang="ts">
// A dish on the public menu, rendered in whichever card style the admin picked in the appearance
// panel (dishCard.style + field toggles) — so /store matches the appearance preview. Themed with the
// tenant --sf-* palette. A quick-add button rides on every style.
import { computed } from 'vue'
import type { StorefrontProduct } from '@/lib/storefront'
import type { DishCardConfig } from '@/lib/menuAppearance'
import { DEFAULT_DISH_CARD } from '@/lib/menuAppearance'
import { formatCOP } from '@/lib/money'

const props = defineProps<{ product: StorefrontProduct; card?: DishCardConfig }>()
const emit = defineEmits<{ (e: 'open'): void; (e: 'add'): void }>()

const cfg = computed(() => props.card ?? DEFAULT_DISH_CARD)
const show = computed(() => cfg.value.show)
const hasAddons = computed(() => props.product.addonIds.length > 0)
const hasRemovable = computed(() => props.product.removableIngredients.length > 0)
const tag = computed(() => props.product.name.slice(0, 2).toUpperCase() || '··')
</script>

<template>
  <!-- LIST: full-width row, thumbnail left, price + add right -->
  <article
    v-if="cfg.style === 'list'"
    class="flex items-center gap-3 rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] p-2.5"
  >
    <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="emit('open')">
      <div v-if="show.image" class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl" :style="{ backgroundColor: 'color-mix(in oklab, var(--sf-primary) 12%, transparent)' }">
        <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" class="size-full object-cover" />
        <span v-else class="text-xl">{{ product.emoji ?? '🍽️' }}</span>
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-[var(--sf-text)]">{{ product.name }}</h3>
        <p v-if="show.description && product.description" class="truncate text-[12px] text-[var(--sf-muted)]">{{ product.description }}</p>
        <div class="mt-0.5 flex gap-2">
          <span v-if="show.addonHint && hasAddons" class="text-[10px]" :style="{ color: 'var(--sf-accent)' }">+ adiciones</span>
          <span v-if="show.removableHint && hasRemovable" class="text-[10px] text-[var(--sf-muted)]">personalizable</span>
        </div>
      </div>
    </button>
    <div class="flex shrink-0 items-center gap-2">
      <span v-if="show.price" class="font-mono text-[14px] font-bold tabular-nums text-[var(--sf-accent)]">{{ formatCOP(product.price) }}</span>
      <button type="button" class="grid size-9 place-items-center rounded-full bg-[var(--sf-primary)] text-white shadow-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]" :aria-label="`Agregar ${product.name}`" @click="emit('add')">
        <i class="pi pi-plus text-sm" />
      </button>
    </div>
  </article>

  <!-- HERO: big image, overlaid title + price -->
  <article
    v-else-if="cfg.style === 'hero'"
    class="overflow-hidden rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)]"
  >
    <button type="button" class="block w-full text-left" @click="emit('open')">
      <div class="relative">
        <div v-if="show.image" class="aspect-[16/9] w-full">
          <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" class="size-full object-cover" />
          <div v-else class="grid size-full place-items-center" :style="{ background: 'linear-gradient(135deg, var(--sf-primary), var(--sf-secondary))' }">
            <span class="text-2xl font-bold text-white/90">{{ tag }}</span>
          </div>
        </div>
        <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
          <span class="text-lg font-bold text-white drop-shadow">{{ product.name }}</span>
          <span v-if="show.price" class="shrink-0 rounded-full bg-white/90 px-2.5 py-0.5 text-[13px] font-bold" :style="{ color: 'var(--sf-primary)' }">{{ formatCOP(product.price) }}</span>
        </div>
      </div>
    </button>
    <div class="flex items-center justify-between gap-2 p-3">
      <p v-if="show.description && product.description" class="line-clamp-1 flex-1 text-[12px] text-[var(--sf-muted)]">{{ product.description }}</p>
      <button type="button" class="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sf-primary)] text-white shadow-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]" :aria-label="`Agregar ${product.name}`" @click="emit('add')">
        <i class="pi pi-plus text-sm" />
      </button>
    </div>
  </article>

  <!-- CARD / GRID: vertical tile (grid is denser via the parent's column count) -->
  <article v-else class="flex flex-col overflow-hidden rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)]">
    <button type="button" class="flex flex-1 flex-col text-left transition active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]" @click="emit('open')">
      <div v-if="show.image" class="relative grid aspect-[16/10] w-full place-items-center overflow-hidden">
        <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" class="size-full object-cover" />
        <div v-else class="grid size-full place-items-center" :style="{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--sf-primary) 16%, var(--sf-surface)), color-mix(in oklab, var(--sf-secondary) 20%, var(--sf-surface)))' }">
          <span class="text-4xl">{{ product.emoji ?? '🍽️' }}</span>
        </div>
      </div>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <h3 class="font-semibold leading-tight text-[var(--sf-text)]">{{ product.name }}</h3>
        <p v-if="show.description && product.description && cfg.style !== 'grid'" class="line-clamp-2 text-[12px] leading-snug text-[var(--sf-muted)]">{{ product.description }}</p>
        <span v-if="show.addonHint && hasAddons" class="text-[10px]" :style="{ color: 'var(--sf-accent)' }">+ adiciones</span>
      </div>
    </button>
    <div class="flex items-center justify-between gap-2 px-3 pb-3">
      <span v-if="show.price" class="font-mono text-[15px] font-bold tabular-nums text-[var(--sf-accent)]">{{ formatCOP(product.price) }}</span>
      <button type="button" class="grid size-9 place-items-center rounded-full bg-[var(--sf-primary)] text-white shadow-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-offset-2" :aria-label="`Agregar ${product.name}`" @click="emit('add')">
        <i class="pi pi-plus text-sm" />
      </button>
    </div>
  </article>
</template>
