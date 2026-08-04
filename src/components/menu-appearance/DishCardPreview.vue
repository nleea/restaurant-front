<script setup lang="ts">
// One dish rendered in the customer's palette, in whichever card style the admin picked. Colors come
// from the --menu-* CSS variables set on the preview screen, so nothing here hardcodes a hue. Field
// visibility follows dishCard.show. Data is real (name/description/image/price from the menu store);
// this component only styles it. Clicking opens the dish-detail preview.
import type { DishCardConfig } from '@/lib/menuAppearance'

defineProps<{
  name: string
  description: string
  imageUrl: string
  /** Formatted price ("$ 28.000") or '' when unpriced. */
  price: string
  /** Two-letter monogram fallback when there's no photo. */
  tag: string
  hasAddons: boolean
  hasRemovable: boolean
  config: DishCardConfig
}>()
defineEmits<{ (e: 'open'): void }>()
</script>

<template>
  <!-- LIST: thumbnail left, text, price right -->
  <button
    v-if="config.style === 'list'"
    type="button"
    class="flex w-full items-center gap-3 py-2.5 text-left"
    @click="$emit('open')"
  >
    <div
      v-if="config.show.image"
      class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg"
      :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-primary) 12%, transparent)' }"
    >
      <img v-if="imageUrl" :src="imageUrl" alt="" class="h-full w-full object-cover" />
      <span v-else class="text-[11px] font-bold" :style="{ color: 'var(--menu-primary)' }">{{ tag }}</span>
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-[14px] font-medium">{{ name }}</p>
      <p v-if="config.show.description && description" class="truncate text-[12px] opacity-60">
        {{ description }}
      </p>
      <div class="mt-0.5 flex gap-1.5">
        <span v-if="config.show.addonHint && hasAddons" class="text-[10px]" :style="{ color: 'var(--menu-accent)' }">+ adiciones</span>
        <span v-if="config.show.removableHint && hasRemovable" class="text-[10px] opacity-55">personalizable</span>
      </div>
    </div>
    <span v-if="config.show.price && price" class="shrink-0 text-[14px] font-semibold" :style="{ color: 'var(--menu-secondary)' }">
      {{ price }}
    </span>
  </button>

  <!-- HERO: big image, overlaid title + price, description below -->
  <button
    v-else-if="config.style === 'hero'"
    type="button"
    class="block w-full overflow-hidden rounded-xl text-left"
    :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-text) 5%, transparent)' }"
    @click="$emit('open')"
  >
    <div class="relative">
      <div v-if="config.show.image" class="h-32 w-full">
        <img v-if="imageUrl" :src="imageUrl" alt="" class="h-full w-full object-cover" />
        <div v-else class="grid h-full w-full place-items-center" :style="{ background: 'linear-gradient(135deg, var(--menu-primary), var(--menu-secondary))' }">
          <span class="text-lg font-bold text-white/90">{{ tag }}</span>
        </div>
      </div>
      <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent p-2.5">
        <span class="text-[15px] font-bold text-white drop-shadow">{{ name }}</span>
        <span v-if="config.show.price && price" class="shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-[12px] font-bold" :style="{ color: 'var(--menu-primary)' }">
          {{ price }}
        </span>
      </div>
    </div>
    <div v-if="(config.show.description && description) || config.show.addonHint || config.show.removableHint" class="px-3 py-2">
      <p v-if="config.show.description && description" class="text-[12px] opacity-70">{{ description }}</p>
      <div class="mt-1 flex gap-2">
        <span v-if="config.show.addonHint && hasAddons" class="text-[10px]" :style="{ color: 'var(--menu-accent)' }">+ adiciones</span>
        <span v-if="config.show.removableHint && hasRemovable" class="text-[10px] opacity-55">personalizable</span>
      </div>
    </div>
  </button>

  <!-- GRID / CARD share a vertical layout; grid is denser (parent lays two per row) -->
  <button
    v-else
    type="button"
    class="flex h-full w-full flex-col overflow-hidden rounded-xl text-left"
    :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-text) 5%, transparent)' }"
    @click="$emit('open')"
  >
    <div v-if="config.show.image" :class="config.style === 'grid' ? 'h-20' : 'h-28'" class="w-full">
      <img v-if="imageUrl" :src="imageUrl" alt="" class="h-full w-full object-cover" />
      <div v-else class="grid h-full w-full place-items-center" :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-primary) 12%, transparent)' }">
        <span class="font-bold" :style="{ color: 'var(--menu-primary)' }">{{ tag }}</span>
      </div>
    </div>
    <div class="flex flex-1 flex-col gap-0.5 p-2.5">
      <p class="text-[13px] font-medium leading-tight" :class="config.style === 'grid' ? 'truncate' : ''">{{ name }}</p>
      <p v-if="config.show.description && description && config.style !== 'grid'" class="line-clamp-2 text-[11px] opacity-60">
        {{ description }}
      </p>
      <div class="mt-auto flex items-center justify-between pt-1">
        <span v-if="config.show.price && price" class="text-[13px] font-semibold" :style="{ color: 'var(--menu-secondary)' }">{{ price }}</span>
        <span v-if="config.show.addonHint && hasAddons" class="text-[10px]" :style="{ color: 'var(--menu-accent)' }">+ adic.</span>
      </div>
    </div>
  </button>
</template>
