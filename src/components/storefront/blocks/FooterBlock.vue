<script setup lang="ts">
// Closing band: name, hours, and social/contact glyphs. Mock content.
import { PICKUP_ADDRESS } from '@/lib/storefront'

defineProps<{ name: string }>()
</script>

<template>
  <footer class="mt-2 px-4 pb-4">
    <div class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-5 py-6 text-center">
      <p class="text-base font-bold text-[var(--sf-text)]">{{ name }}</p>
      <p class="mt-1 text-[12px] text-[var(--sf-muted)]">{{ PICKUP_ADDRESS }}</p>
      <p class="mt-0.5 text-[12px] text-[var(--sf-muted)]">Lunes a domingo · 11:00 a 22:00</p>
      <div class="mt-3 flex justify-center gap-4 text-[var(--sf-muted)]">
        <i class="pi pi-whatsapp" />
        <i class="pi pi-instagram" />
        <i class="pi pi-facebook" />
        <i class="pi pi-map-marker" />
      </div>
    </div>
  </footer>
</template>
