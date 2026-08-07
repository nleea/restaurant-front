<script setup lang="ts">
// Horizontal, scrollable category chips that jump straight to a section of the full menu.
import type { StorefrontCategory } from '@/lib/storefront'

defineProps<{ categories: StorefrontCategory[] }>()
const emit = defineEmits<{ (e: 'jump', categoryId: string): void }>()
</script>

<template>
  <section class="px-4">
    <p class="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Categorías</p>
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button
        v-for="c in categories"
        :key="c.id"
        type="button"
        class="shrink-0 rounded-full border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-2 text-[13px] font-medium text-[var(--sf-text)] transition active:scale-95 hover:border-[var(--sf-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
        @click="emit('jump', c.id)"
      >
        {{ c.name }}
      </button>
    </div>
  </section>
</template>
