<script setup lang="ts">
// Promo block on the public storefront — the admin's "Plato del día" / announcement. Themed with the
// tenant's --sf-* palette so it matches the appearance preview.
import type { PromoContent } from '@/lib/menuAppearance'

defineProps<{ content: PromoContent }>()
</script>

<template>
  <section class="px-4">
    <div class="overflow-hidden rounded-2xl" :style="{ backgroundColor: 'color-mix(in oklab, var(--sf-primary) 12%, transparent)' }">
      <img v-if="content.imageUrl" :src="content.imageUrl" alt="" class="h-32 w-full object-cover" />
      <div class="p-4">
        <p class="text-base font-bold" :style="{ color: 'var(--sf-primary)' }">{{ content.title }}</p>
        <p class="mt-1 text-[13px] text-[var(--sf-muted)]">{{ content.body }}</p>
      </div>
    </div>
  </section>
</template>
