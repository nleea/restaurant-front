<script setup lang="ts">
// Gallery block — a horizontal strip of the tenant's dish photos (sourced from the products that
// carry an image, plus any standalone images in the config). Placeholder tiles when there are none.
defineProps<{ photos: string[] }>()
</script>

<template>
  <section class="px-4">
    <p class="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Galería</p>
    <div v-if="photos.length" class="flex gap-2 overflow-x-auto pb-1">
      <img v-for="(u, i) in photos" :key="i" :src="u" alt="" class="h-28 w-28 shrink-0 rounded-xl object-cover" />
    </div>
    <div v-else class="flex gap-2">
      <div
        v-for="i in 3"
        :key="i"
        class="grid h-28 w-28 shrink-0 place-items-center rounded-xl"
        :style="{ backgroundColor: 'color-mix(in oklab, var(--sf-text) 8%, transparent)' }"
      >
        <i class="pi pi-image text-lg text-[var(--sf-muted)]" />
      </div>
    </div>
  </section>
</template>
