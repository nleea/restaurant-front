<script setup lang="ts">
// Hero banner: the restaurant's banner photo (or a themed gradient), with the logo + name overlaid.
defineProps<{ name: string; bannerUrl: string; logoUrl: string }>()
</script>

<template>
  <header class="relative">
    <div class="relative h-44 w-full overflow-hidden sm:h-56">
      <img v-if="bannerUrl" :src="bannerUrl" alt="" class="size-full object-cover" />
      <div
        v-else
        class="size-full"
        :style="{ background: 'linear-gradient(135deg, var(--sf-primary), var(--sf-secondary))' }"
      />
      <div class="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-black/25 px-5 pb-5 text-center">
        <img v-if="logoUrl" :src="logoUrl" alt="" class="size-14 rounded-full border-2 border-white/85 object-cover shadow-lg" />
        <h1 class="text-2xl font-bold leading-tight text-white drop-shadow sm:text-3xl">{{ name }}</h1>
      </div>
    </div>
  </header>
</template>
